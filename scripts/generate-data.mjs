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
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../src/data/performance.json");

// --- seeded PRNG (mulberry32) so output is deterministic -------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260608);
const jitter = (scale) => 1 + (rnd() * 2 - 1) * scale;
const round = (n, step = 1) => Math.round(n / step) * step;

// --- configuration ----------------------------------------------------------
// Two years of history so every period (incl. "12 měsíců") has an equal-length
// comparison window before it.
const DAYS = 730;
// End on a month boundary so the 12-month view is exactly 12 complete calendar
// months (no partial leading/trailing bucket that would dip the trend chart).
const AS_OF = "2026-05-31"; // last complete day represented in the dataset

// Seasonality multiplier per calendar month (0 = Jan). A Czech baby-goods
// e-shop peaks before Christmas and in spring, dips mid-summer.
const SEASON = [0.92, 0.95, 1.05, 1.08, 1.04, 0.9, 0.82, 0.86, 1.0, 1.08, 1.22, 1.3];
// Conversion rate gets a small lift in high-intent shopping months.
const SEASON_CR = [0.97, 0.98, 1.02, 1.03, 1.0, 0.95, 0.92, 0.94, 1.0, 1.04, 1.1, 1.14];
// Weekend evenings convert a touch better for B2C baby shopping.
const WEEKDAY_VISITS = [1.04, 1.0, 0.98, 0.98, 1.0, 1.03, 1.05]; // Sun..Sat
const WEEKDAY_CR = [1.05, 1.0, 0.99, 0.98, 0.99, 1.02, 1.04];

const asOfDate = new Date(`${AS_OF}T00:00:00Z`);
const daily = [];

for (let i = 0; i < DAYS; i++) {
  const date = new Date(asOfDate);
  date.setUTCDate(asOfDate.getUTCDate() - (DAYS - 1 - i));
  const month = date.getUTCMonth();
  const dow = date.getUTCDay();
  const t = i / (DAYS - 1); // 0 → 1 progress across the year

  // Traffic grows ~70 % over the year as the account matures.
  const visitsBase = 1180 + t * 820;
  const visits = Math.max(
    300,
    round(visitsBase * SEASON[month] * WEEKDAY_VISITS[dow] * jitter(0.1))
  );

  // Conversion rate improves from ~2.2 % to ~2.7 % as the funnel is optimised.
  const cr = (0.0218 + t * 0.005) * SEASON_CR[month] * WEEKDAY_CR[dow] * jitter(0.08);
  const conversions = Math.max(1, Math.round(visits * cr));

  // Average order value drifts up with the product mix.
  const aov = (1520 + t * 190) * jitter(0.06);
  const revenue = round(conversions * aov, 1);

  // PNO (cost / revenue) falls from ~20.5 % to ~13.5 % as spend is optimised.
  const pno = (0.205 - t * 0.07) * jitter(0.06);
  const cost = round(revenue * pno, 1);

  daily.push({
    date: date.toISOString().slice(0, 10),
    visits,
    cost,
    conversions,
    revenue,
  });
}

// --- channel mix ------------------------------------------------------------
// Shares are applied to whatever period the user selects, so the channel table
// always reconciles with the headline KPIs. Each share dimension sums to 1, and
// because the dimensions differ, every channel ends up with its own realistic
// CR / AOV / PNO profile (e.g. Heureka is efficient, Meta prospecting is not).
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

const dataset = {
  client: {
    name: "Mionelo",
    domain: "mionelo.cz",
    segment: "E-commerce · ořechy, semínka a superpotraviny",
    currency: "CZK",
    managedBy: "Systedo",
  },
  meta: {
    disclaimer: "Ilustrativní data vygenerovaná pro účely případové studie.",
    asOf: AS_OF,
    days: DAYS,
    seed: 20260608,
  },
  goals: {
    pno: 0.15, // cílové PNO domluvené s klientem
    monthlyRevenue: 1_600_000,
  },
  channels: channels.map(({ channel, color, visit, cost, conv, rev }) => ({
    channel,
    color,
    shares: { visits: visit, cost, conversions: conv, revenue: rev },
  })),
  daily,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(dataset, null, 2) + "\n", "utf8");

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
