/** Per-IP abuse guards for the public, paid LLM endpoints (server-only).
 *
 *  Every AI route (`/api/ai`, `/api/campaigns/analyze`) shells out to a *paid*
 *  provider — the Claude subscription in dev, metered Gemini in prod — and is
 *  unauthenticated by design (it's a public case-study demo anyone can open).
 *  Without a throttle a single looping visitor can drain the provider budget or
 *  pin the box on a 90 s spawn. These guards close that gap with:
 *
 *    • a fixed-window counter per `bucket`+IP, persisted in the same zero-dep
 *      `node:sqlite` store as the rest of the app (no new dependency), and
 *    • a process-level in-flight concurrency cap so slow spawns can't stack up.
 *
 *  Everything is tunable via env so a deploy can tighten/loosen without a code
 *  change; the defaults are conservative enough to protect a demo budget.
 */
import { getDb } from "../db";

export interface RateRule {
  /** logical bucket so different endpoints don't share one budget */
  bucket: string;
  /** max requests allowed within the window */
  limit: number;
  /** window length in milliseconds */
  windowMs: number;
}

export interface RateResult {
  ok: boolean;
  /** seconds until the caller may retry (only meaningful when !ok) */
  retryAfter: number;
}

const MIN = 60_000;
const DAY = 86_400_000;

const envInt = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Max bytes we'll accept in a request body before parsing it. */
export const MAX_BODY_BYTES = envInt("AI_MAX_BODY_BYTES", 16_384);
/** Max concurrent in-flight provider calls across the whole process. */
export const MAX_CONCURRENT = envInt("AI_MAX_CONCURRENT", 4);

/** Rule presets, built lazily so env overrides are read at call time. */
export const RATE_RULES = {
  /** AI assistant generations — per minute and per day, per IP. */
  aiPerMin: (): RateRule => ({ bucket: "ai:min", limit: envInt("AI_RATE_PER_MIN", 8), windowMs: MIN }),
  aiPerDay: (): RateRule => ({ bucket: "ai:day", limit: envInt("AI_RATE_PER_DAY", 80), windowMs: DAY }),
  /** Campaign evaluation — also a paid LLM call. */
  evalPerMin: (): RateRule => ({ bucket: "eval:min", limit: envInt("AI_RATE_PER_MIN", 8), windowMs: MIN }),
  evalPerDay: (): RateRule => ({ bucket: "eval:day", limit: envInt("AI_RATE_PER_DAY", 80), windowMs: DAY }),
  /** Campaign sync — cheaper (connector only), so a looser per-minute cap. */
  syncPerMin: (): RateRule => ({ bucket: "sync:min", limit: envInt("SYNC_RATE_PER_MIN", 20), windowMs: MIN }),
};

/** Number of trusted reverse-proxy hops in front of the app (1 on Vercel). The
 *  real client IP sits that many entries from the RIGHT of x-forwarded-for;
 *  anything further left is client-supplied and must not be trusted. */
const TRUSTED_PROXY_HOPS = envInt("TRUSTED_PROXY_HOPS", 1);

/** Best-effort client IP, resistant to x-forwarded-for spoofing.
 *
 *  A client can prepend arbitrary `x-forwarded-for` entries, so the *leftmost*
 *  value is attacker-controlled — taking it (the previous behaviour) let a caller
 *  rotate the header to land in a fresh rate-limit bucket on every request,
 *  defeating the per-IP caps that are the only budget guard for anonymous users.
 *  We instead prefer the platform's verified connecting-IP header (x-real-ip /
 *  x-vercel-forwarded-for, which the proxy sets and a client cannot forge), and
 *  otherwise read XFF from the RIGHT, stepping in by the configured trusted-hop
 *  count. Falls back to a shared "unknown" bucket so a missing header still counts
 *  toward *some* limit. */
export function clientIp(request: Request): string {
  const trusted =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-vercel-forwarded-for")?.trim();
  if (trusted) return trusted;

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length > 0) {
      const idx = Math.max(0, hops.length - TRUSTED_PROXY_HOPS);
      return hops[idx] || "unknown";
    }
  }
  return "unknown";
}

/** Reject obviously oversized bodies via the content-length header before we
 *  ever read/parse them. */
export function tooLarge(request: Request, maxBytes: number = MAX_BODY_BYTES): boolean {
  const len = Number(request.headers.get("content-length"));
  return Number.isFinite(len) && len > maxBytes;
}

/** Fixed-window check across one or more rules. Returns the first rule that is
 *  exceeded (with its retry-after in seconds), or { ok: true } when all pass.
 *  Counters are only incremented when *every* rule passes, so a rejected request
 *  doesn't consume budget. */
export function rateLimit(ip: string, rules: RateRule[]): RateResult {
  const db = getDb();
  const now = Date.now();

  // Opportunistic cleanup so the table can't grow unbounded.
  db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(now - DAY);

  const read = db.prepare("SELECT window_start, count FROM rate_limits WHERE bucket = ? AND ip = ?");

  // First pass: would any rule be exceeded? (read-only)
  const plans: { rule: RateRule; windowStart: number; nextCount: number }[] = [];
  for (const rule of rules) {
    const windowStart = now - (now % rule.windowMs);
    const row = read.get(rule.bucket, ip) as { window_start: number; count: number } | undefined;
    const current = row && row.window_start >= windowStart ? row.count : 0;
    if (current >= rule.limit) {
      const retryAfter = Math.ceil((windowStart + rule.windowMs - now) / 1000);
      return { ok: false, retryAfter: Math.max(1, retryAfter) };
    }
    plans.push({ rule, windowStart, nextCount: current + 1 });
  }

  // Second pass: commit the increments.
  const write = db.prepare(
    `INSERT INTO rate_limits (bucket, ip, window_start, count) VALUES (?, ?, ?, ?)
     ON CONFLICT(bucket, ip) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`
  );
  for (const p of plans) write.run(p.rule.bucket, ip, p.windowStart, p.nextCount);

  return { ok: true, retryAfter: 0 };
}

// --- process-level concurrency cap -----------------------------------------
// Survives Next.js dev hot-reload on globalThis (same pattern as the db handle).
const g = globalThis as unknown as { __aiInflight?: number };

/** Try to take an in-flight slot; returns false when the process is already at
 *  `max` concurrent provider calls. Pair every `true` with `releaseSlot()`. */
export function acquireSlot(max: number = MAX_CONCURRENT): boolean {
  const n = g.__aiInflight ?? 0;
  if (n >= max) return false;
  g.__aiInflight = n + 1;
  return true;
}

export function releaseSlot(): void {
  g.__aiInflight = Math.max(0, (g.__aiInflight ?? 1) - 1);
}

// --- response helpers ------------------------------------------------------

/** 429 with a `Retry-After` header. */
export function tooManyRequests(retryAfter: number, message: string): Response {
  return Response.json(
    { error: message, retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/** 413 Payload Too Large. */
export function payloadTooLarge(message: string): Response {
  return Response.json({ error: message }, { status: 413 });
}
