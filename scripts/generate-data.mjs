/**
 * Deterministic generator for the dashboard's demo dataset.
 *
 * Why a generator (and not hand-written JSON)?
 *  - The numbers stay *internally consistent*: revenue = conversions × AOV,
 *    cost = revenue × PNO, conversions = visits × CR. Every derived metric on
 *    the dashboard reconciles because it is computed from one daily source of truth.
 *  - It is *reproducible*: a fixed seed means re-running `npm run seed` always
 *    yields the same file, so the committed JSON and the generator never drift.
 *  - It tells a believable story: visits trend up, conversion rate improves and
 *    PNO (podíl nákladů na obratu) falls over the year — exactly what a client
 *    would expect to see after a marketing agency takes over.
 *
 * Run with:  node scripts/generate-data.mjs   (or `npm run seed`)
 * Monthly refresh:  node scripts/generate-data.mjs --as-of YYYY-MM-DD
 * (see the AS_OF configuration block below), then commit the regenerated JSON.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Shared demo core — the same seeded PRNG as the sample campaigns and sample
// keywords (one implementation instead of three copies).
import { mulberry32, hashStr } from "../src/lib/demo/prng.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../src/data/performance.json");

// Single seed constant so the PRNG and the recorded meta.seed never diverge.
const SEED = 20260608;
const rnd = mulberry32(SEED);
const jitter = (scale) => 1 + (rnd() * 2 - 1) * scale;
const round = (n, step = 1) => Math.round(n / step) * step;

// --- configuration ----------------------------------------------------------
// The series ends on AS_OF (the dashboard's "today"). A *mid-month* default is
// deliberate: it keeps the month-end forecast machinery alive — GoalPacing's
// seasonality-weighted projection, P10–P90 band and goal probability are all
// stuck in the degenerate "měsíc dokončen" state when the series ends exactly
// on a month boundary. Monthly one-command refresh:
//
//     node scripts/generate-data.mjs --as-of 2026-07-20     (then commit the JSON)
//
// Downstream already handles the partial month: bucketize() flags partial
// buckets, evaluatePeriod() reports truncation and monthlyAttainmentHistory()
// counts complete months only.
const DEFAULT_AS_OF = "2026-06-20";

/** Validated `--as-of YYYY-MM-DD` CLI override (defaults to DEFAULT_AS_OF). */
function parseAsOf(argv) {
  const eq = argv.find((a) => a.startsWith("--as-of="));
  const i = argv.indexOf("--as-of");
  const raw = eq ? eq.slice("--as-of=".length) : i >= 0 ? argv[i + 1] : null;
  if (raw == null) return DEFAULT_AS_OF;
  const d = new Date(`${raw}T00:00:00Z`);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(raw) &&
    !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === raw;
  if (!valid) {
    console.error(`✗ --as-of must be a valid YYYY-MM-DD date, got "${raw}"`);
    process.exit(1);
  }
  return raw;
}
const AS_OF = parseAsOf(process.argv.slice(2));

// Two full years ending on the last complete month boundary — so every period
// (incl. "12 měsíců") keeps an equal-length comparison window before it — plus
// the in-progress days of the current month when AS_OF sits mid-month.
const TREND_DAYS = 730;

// Seasonality multiplier per calendar month (0 = Jan). A Czech superfoods /
// nuts-and-seeds e-shop peaks before Christmas and in the spring "healthy
// resolutions" window, and dips mid-summer.
const SEASON = [0.92, 0.95, 1.05, 1.08, 1.04, 0.9, 0.82, 0.86, 1.0, 1.08, 1.22, 1.3];
// Conversion rate gets a small lift in high-intent shopping months.
const SEASON_CR = [0.97, 0.98, 1.02, 1.03, 1.0, 0.95, 0.92, 0.94, 1.0, 1.04, 1.1, 1.14];
// Weekend evenings convert a touch better for B2C grocery shopping.
const WEEKDAY_VISITS = [1.04, 1.0, 0.98, 0.98, 1.0, 1.03, 1.05]; // Sun..Sat
const WEEKDAY_CR = [1.05, 1.0, 0.99, 0.98, 0.99, 1.02, 1.04];

const asOfDate = new Date(`${AS_OF}T00:00:00Z`);
const asOfDay = asOfDate.getUTCDate();
const daysInAsOfMonth = new Date(
  Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() + 1, 0)
).getUTCDate();
const DAYS = TREND_DAYS + (asOfDay === daysInAsOfMonth ? 0 : asOfDay);

// --- story events ------------------------------------------------------------
// Hand-authored, deterministic "story events" layered onto the smooth jittered
// baseline. Without them the downstream anomaly engine is starved: the bounded
// ±10 % jitter can never reach the z ≥ 2.5 flag threshold, so the outage /
// spike / goal-breach paths (and the "dopad ≈ −X tis. Kč" money-impact
// headline) were dead UI in the shipped demo. Events are applied AFTER the base
// computation (and after its floors) as fixed per-day multipliers and consume
// NO PRNG draws — every non-event day stays byte-identical to the plain
// generator output.
//
// Dates: Black Friday is calendar-anchored (both in-window years); the outage
// and the cost runaway are anchored relative to AS_OF so they stay inside the
// default 90-day dashboard window whenever the dataset is refreshed.
const DAY_MS = 86_400_000;
const isoDay = (d) => d.toISOString().slice(0, 10);
const daysBeforeAsOf = (n) => isoDay(new Date(asOfDate.getTime() - n * DAY_MS));
/** Black Friday (last Friday of November) of the given year. */
function blackFriday(year) {
  const d = new Date(Date.UTC(year, 10, 30));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return isoDay(d);
}
/** The Saturday at or before (AS_OF − minDaysBefore) — so the cost-runaway
 *  story always spans a real weekend, whatever weekday AS_OF falls on. */
function saturdayBefore(minDaysBefore) {
  const d = new Date(asOfDate.getTime() - minDaysBefore * DAY_MS);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() - 1);
  return isoDay(d);
}

// Multipliers apply to the day's computed visits/conversions/revenue/cost.
// Internal consistency is preserved where the story needs it and broken where
// the break IS the story: the tracking outage keeps cost at its expected level
// (Ads kept spending) while *measured* conversions/revenue collapse — exactly
// what drives the PNO goal-breach rule.
const EVENTS = [
  {
    date: blackFriday(2024),
    label: "Black Friday — špička poptávky",
    kind: "spike",
    mult: { visits: 1.8, conversions: 2.4, revenue: 2.5, cost: 1.6 },
  },
  {
    date: blackFriday(2025),
    label: "Black Friday — špička poptávky",
    kind: "spike",
    mult: { visits: 1.8, conversions: 2.4, revenue: 2.5, cost: 1.6 },
  },
  {
    date: daysBeforeAsOf(120),
    label: "Spuštění kampaně Performance Max",
    kind: "milestone",
  },
  {
    date: daysBeforeAsOf(18),
    label: "Výpadek měření konverzí (rozbitá měřicí značka)",
    kind: "outage",
    mult: { visits: 0.06, conversions: 0.03, revenue: 0.03, cost: 1 },
  },
  {
    date: saturdayBefore(8),
    days: 2,
    label: "Víkendový únik nákladů (chybný limit nabídek)",
    kind: "cost-runaway",
    mult: { visits: 1, conversions: 1, revenue: 1, cost: 2.4 },
  },
].sort((a, b) => (a.date < b.date ? -1 : 1));

// Expand multi-day events into a per-date multiplier lookup for the daily loop.
const eventMultByDate = new Map();
for (const e of EVENTS) {
  if (!e.mult) continue;
  const start = new Date(`${e.date}T00:00:00Z`);
  for (let k = 0; k < (e.days ?? 1); k++) {
    eventMultByDate.set(isoDay(new Date(start.getTime() + k * DAY_MS)), e.mult);
  }
}

// --- channel mix ------------------------------------------------------------
// Shares are applied to whatever period the user selects, so the channel table
// always reconciles with the headline KPIs. Each share dimension sums to 1, and
// because the dimensions differ, every channel ends up with its own realistic
// CR / AOV / PNO profile (e.g. Heureka is efficient, Meta prospecting is not).
// (Defined before the daily loop because the paid-traffic share below derives
// from the organic channel's visit share.)
const channels = [
  { channel: "Google Ads (Search + PMax)", color: "#1f8f88", visit: 0.22, cost: 0.33, conv: 0.29, rev: 0.3 },
  { channel: "Google Nákupy", color: "#2dd4ce", visit: 0.12, cost: 0.16, conv: 0.14, rev: 0.14 },
  { channel: "Sklik (Seznam)", color: "#15324b", visit: 0.11, cost: 0.13, conv: 0.12, rev: 0.12 },
  { channel: "Heureka", color: "#f59e0b", visit: 0.08, cost: 0.07, conv: 0.1, rev: 0.09 },
  { channel: "Zboží.cz", color: "#94a3b8", visit: 0.06, cost: 0.06, conv: 0.07, rev: 0.07 },
  { channel: "Meta (FB / IG)", color: "#fb7141", visit: 0.19, cost: 0.25, conv: 0.12, rev: 0.13 },
  { channel: "Organic & přímá", color: "#0b1b2b", visit: 0.22, cost: 0.0, conv: 0.16, rev: 0.15 },
];

// sanity-check that shares sum to ~1 on every dimension
for (const dim of ["visit", "cost", "conv", "rev"]) {
  const sum = channels.reduce((a, c) => a + c[dim], 0);
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`channel ${dim} shares sum to ${sum}, expected 1`);
  }
}

// --- paid traffic (impressions + clicks) --------------------------------------
// Clicks are the paid share of visits — derived from the channel mix (1 − the
// organic channel's visit share) so the two never drift apart — and impressions
// follow from a blended CTR that improves gently as the account matures (better
// query coverage, ad relevance and shopping feeds), unlocking the CPC/CTR KPIs.
// Each day's jitter comes from a SEPARATE per-day PRNG (seeded off the shared
// hash, not the main `rnd` stream) so the original visits/cost/conversions/
// revenue series stays byte-identical to the committed history.
const PAID_VISIT_SHARE =
  1 - channels.find((c) => c.channel.startsWith("Organic")).visit;
const CTR_START = 0.016; // blended paid CTR at the start of the two years
const CTR_LIFT = 0.004; // gentle improvement across the trend span

const daily = [];

for (let i = 0; i < DAYS; i++) {
  const date = new Date(asOfDate);
  date.setUTCDate(asOfDate.getUTCDate() - (DAYS - 1 - i));
  const dateStr = isoDay(date);
  const month = date.getUTCMonth();
  const dow = date.getUTCDay();
  // 0 → 1 progress across the two-year trend span. Anchored on TREND_DAYS (not
  // DAYS) so the partial-month extension extrapolates the maturation trend
  // slightly past 1 instead of re-normalizing it — a monthly `--as-of` refresh
  // therefore never rewrites the already-committed history.
  const t = i / (TREND_DAYS - 1);

  // Traffic grows ~70 % over the year as the account matures.
  const visitsBase = 1180 + t * 820;
  let visits = Math.max(
    300,
    round(visitsBase * SEASON[month] * WEEKDAY_VISITS[dow] * jitter(0.1))
  );

  // Conversion rate improves from ~2.2 % to ~2.7 % as the funnel is optimised.
  const cr = (0.0218 + t * 0.005) * SEASON_CR[month] * WEEKDAY_CR[dow] * jitter(0.08);
  let conversions = Math.max(1, Math.round(visits * cr));

  // Average order value drifts up with the product mix.
  const aov = (1520 + t * 190) * jitter(0.06);
  let revenue = round(conversions * aov, 1);

  // PNO (cost / revenue) falls from ~20.5 % to ~13.5 % as spend is optimised.
  const pno = (0.205 - t * 0.07) * jitter(0.06);
  let cost = round(revenue * pno, 1);

  // Story-event override (see EVENTS above): fixed multipliers applied after the
  // base computation and its floors, drawing nothing from the PRNG.
  const mult = eventMultByDate.get(dateStr);
  if (mult) {
    visits = Math.max(0, Math.round(visits * mult.visits));
    conversions = Math.max(0, Math.round(conversions * mult.conversions));
    revenue = Math.max(0, round(revenue * mult.revenue, 1));
    cost = Math.max(0, round(cost * mult.cost, 1));
  }

  // Paid traffic, derived from the FINAL visits (consistent by construction —
  // event days move clicks with them). Per-day secondary PRNG: consuming zero
  // draws from `rnd` keeps the already-committed series byte-identical.
  const trnd = mulberry32(hashStr(`traffic:${dateStr}`) ^ SEED);
  const tj = (scale) => 1 + (trnd() * 2 - 1) * scale;
  const clicks = Math.max(0, Math.round(visits * PAID_VISIT_SHARE * tj(0.05)));
  const ctrDay = (CTR_START + t * CTR_LIFT) * tj(0.08);
  const impressions = Math.max(clicks, Math.round(clicks / ctrDay));

  daily.push({
    date: dateStr,
    visits,
    impressions,
    clicks,
    cost,
    conversions,
    revenue,
  });
}

// Managing agency shown in the dataset. Kept as a single constant so a rebrand
// can't drift between the generator and the committed JSON (it once did:
// commit 126adcc renamed this in the JSON only, and a re-seed would have reverted it).
const AGENCY = "Adamant";

const dataset = {
  client: {
    name: "Mionelo",
    domain: "mionelo.cz",
    segment: "E-commerce · ořechy, semínka a superpotraviny",
    currency: "CZK",
    managedBy: AGENCY,
  },
  meta: {
    disclaimer: "Ilustrativní data vygenerovaná pro účely případové studie.",
    asOf: AS_OF,
    days: DAYS,
    seed: SEED,
  },
  goals: {
    pno: 0.15, // cílové PNO domluvené s klientem
    // ~5 % pod trailing run-rate posledního měsíce (≈2,97 mil. Kč k AS_OF), aby
    // ukazatel plnění cíle dával smysl (dřív 1,6 mil. = nereálných 185 %).
    monthlyRevenue: 2_800_000,
  },
  channels: channels.map(({ channel, color, visit, cost, conv, rev }) => ({
    channel,
    color,
    shares: { visits: visit, cost, conversions: conv, revenue: rev },
  })),
  // Authored story-event calendar. The multipliers are already baked into
  // `daily`; this list is the annotation layer (chart markers, AI grounding).
  events: EVENTS.map(({ date, label, kind, days }) =>
    days && days > 1 ? { date, label, kind, days } : { date, label, kind }
  ),
  daily,
};

const OUTPUT = JSON.stringify(dataset, null, 2) + "\n";

if (process.argv.includes("--check")) {
  // Drift guard (`npm run seed:check`): fail if the committed JSON no longer
  // matches fresh generator output, so a hand edit can't silently diverge — the
  // "never drift" promise above is now enforceable, not just documented.
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    /* missing file → treated as a mismatch below */
  }
  // Compare EOL-normalized: a Windows (autocrlf) checkout of the same bytes is
  // not drift — only actual content changes should fail the guard.
  if (current.replace(/\r\n/g, "\n") !== OUTPUT) {
    console.error("✗ src/data/performance.json is out of sync with generate-data.mjs. Run `npm run seed`.");
    process.exit(1);
  }
  console.log("✓ performance.json matches the generator.");
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, OUTPUT, "utf8");

  // quick summary so the run is auditable
  const totals = daily.reduce(
    (a, d) => ({
      visits: a.visits + d.visits,
      cost: a.cost + d.cost,
      conversions: a.conversions + d.conversions,
      revenue: a.revenue + d.revenue,
    }),
    { visits: 0, cost: 0, conversions: 0, revenue: 0 }
  );
  console.log(`Wrote ${OUT} (${daily.length} days)`);
  console.log(
    `Full-series totals → visits ${totals.visits.toLocaleString("cs-CZ")}, ` +
      `revenue ${Math.round(totals.revenue).toLocaleString("cs-CZ")} Kč, ` +
      `cost ${Math.round(totals.cost).toLocaleString("cs-CZ")} Kč, ` +
      `PNO ${((totals.cost / totals.revenue) * 100).toFixed(1)} %`
  );
}
