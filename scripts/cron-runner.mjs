#!/usr/bin/env node
/** Self-host cron sidecar (docs/open-source/self-hosting.md §6, option 1).
 *
 *  Vercel's platform scheduler does not exist off Vercel, but the five cron
 *  routes are already HTTP-shaped and CRON_SECRET-gated — so the self-host
 *  equivalent is just a tiny in-process scheduler firing the same authenticated
 *  GETs on the same schedules. This runner reads the schedules from vercel.json
 *  (the single source of truth; nothing is duplicated here), matches them in
 *  UTC exactly as Vercel does, and fires each due route with
 *  `Authorization: Bearer ${CRON_SECRET}`.
 *
 *  Run it as the compose `cron` service (same image as the app), on a VPS via
 *  systemd, or ad hoc:
 *
 *      CRON_TARGET=http://localhost:3000 CRON_SECRET=... node scripts/cron-runner.mjs
 *
 *  Env:
 *    CRON_SECRET   required — the same value the app was started with. The
 *                  routes fail closed without it, so the runner refuses to
 *                  start rather than firing five 401s an hour forever.
 *    CRON_TARGET   base URL of the app (default http://localhost:3000; in
 *                  compose: http://app:3000).
 *
 *  Deliberately dependency-free and idempotency-naive: the routes themselves
 *  carry the real guarantees (claim locks, stale-claim reclamation, sent
 *  guards), so a duplicate or missed tick degrades gracefully. The requests
 *  allow the routes' full 300 s budget. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROUTE_BUDGET_MS = 300_000; // the routes' own maxDuration in vercel.json
const TICK_MS = 60_000;

const target = (process.env.CRON_TARGET || "http://localhost:3000").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error(
    "[cron-runner] CRON_SECRET is not set. The cron routes fail closed without it, " +
      "so there is nothing this runner could successfully call. Set the same CRON_SECRET " +
      "the app runs with and restart. (Running without crons at all is also fine — " +
      "all five jobs are background refreshes.)"
  );
  process.exit(1);
}

/** vercel.json is the schedule's single source of truth. Resolved relative to
 *  this file so the runner works from any working directory. */
const vercelJsonPath = join(dirname(fileURLToPath(import.meta.url)), "..", "vercel.json");
const crons = JSON.parse(readFileSync(vercelJsonPath, "utf8")).crons;
if (!Array.isArray(crons) || crons.length === 0) {
  console.error(`[cron-runner] no crons found in ${vercelJsonPath}`);
  process.exit(1);
}

/** Minimal 5-field cron matcher — supports exactly what vercel.json uses:
 *  numbers and "*" (per field). Anything fancier is a loud startup error, not a
 *  silently-never-firing schedule. Matches in UTC, like Vercel. */
function parseField(field, name, min, max) {
  if (field === "*") return null; // wildcard
  const n = Number(field);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`unsupported cron field ${name}=${JSON.stringify(field)} (only numbers and "*" are supported)`);
  }
  return n;
}

function parseSchedule(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`unsupported cron expression ${JSON.stringify(expr)}`);
  const [minute, hour, dom, month, dow] = parts;
  return {
    minute: parseField(minute, "minute", 0, 59),
    hour: parseField(hour, "hour", 0, 23),
    dayOfMonth: parseField(dom, "day-of-month", 1, 31),
    month: parseField(month, "month", 1, 12),
    dayOfWeek: parseField(dow, "day-of-week", 0, 7),
  };
}

function matches(s, date) {
  const dow = date.getUTCDay(); // 0 = Sunday; cron's 7 also means Sunday
  return (
    (s.minute === null || s.minute === date.getUTCMinutes()) &&
    (s.hour === null || s.hour === date.getUTCHours()) &&
    (s.dayOfMonth === null || s.dayOfMonth === date.getUTCDate()) &&
    (s.month === null || s.month === date.getUTCMonth() + 1) &&
    (s.dayOfWeek === null || s.dayOfWeek % 7 === dow)
  );
}

const jobs = crons.map(({ path, schedule }) => ({ path, schedule, parsed: parseSchedule(schedule) }));

async function fire(job) {
  const url = `${target}${job.path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(ROUTE_BUDGET_MS),
    });
    const took = Date.now() - started;
    console.log(`[cron-runner] ${job.path} → ${res.status} in ${took}ms`);
    if (res.status === 401) {
      console.error("[cron-runner] 401 — CRON_SECRET here does not match the app's. Fix and restart.");
    }
  } catch (err) {
    console.error(`[cron-runner] ${job.path} failed after ${Date.now() - started}ms:`, err?.message ?? err);
  }
}

let lastMinute = null;
function tick() {
  const now = new Date();
  // One evaluation per calendar minute, even if timers drift across a boundary.
  const minuteKey = Math.floor(now.getTime() / TICK_MS);
  if (minuteKey === lastMinute) return;
  lastMinute = minuteKey;
  for (const job of jobs) {
    if (matches(job.parsed, now)) void fire(job);
  }
}

console.log(
  `[cron-runner] scheduling ${jobs.length} job(s) against ${target} (UTC):\n` +
    jobs.map((j) => `  ${j.schedule.padEnd(12)} ${j.path}`).join("\n")
);

// Align the first tick to the next minute boundary, then tick every minute.
// (No catch-up runs on start: the routes are periodic refreshes and the report
// route claim-locks its day, so waiting out the current minute is correct.)
setTimeout(() => {
  tick();
  setInterval(tick, TICK_MS);
}, TICK_MS - (Date.now() % TICK_MS));
