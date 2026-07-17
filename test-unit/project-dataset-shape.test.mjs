/** Direction 1 — per-type + per-project dataset SHAPE variation. Every sample
 *  project used to be a linear transform of ONE demo curve (identical seasonality,
 *  weekday profile, spike days). getProjectDataset now re-shapes the scaled series
 *  per type + per project at RUNTIME. This pins the contract:
 *   - determinism: same project → identical curve; different projects/types differ
 *   - bounds: every per-day factor within ±25%, cumulative total drift bounded
 *   - ratio safety: uniform scaling keeps per-day ROAS/PNO pointwise identical
 *   - non-project path (scaledDataset, e.g. microsites) stays byte-identical
 *   - engine sanity: anomalies/trends over varied curves don't explode (no NaN,
 *     anomaly counts stay in a sane band) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// The dataset spine imports the base performance.json — register the JSON hook.
register("./json-loader.mjs", import.meta.url);

const { scaledDataset, getProjectDataset, applyProjectShape, projectShapeFactors } = await import(
  "@/lib/project-data/dataset"
);
const { detectAnomalies } = await import("@/lib/metrics/anomalies");
const { detectTrends } = await import("@/lib/metrics/trends");

const project = (id, type = "eshop") => ({
  id,
  name: `Proj ${id}`,
  type,
  accentColor: "#000",
  domain: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const TYPES = ["eshop", "app", "leadgen", "content", "local"];

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const total = (data, key) => sum(data.daily.map((d) => d[key]));

test("deterministic per project — identical curve on repeat", () => {
  const p = project("proj-aaaa", "eshop");
  const a = getProjectDataset(p);
  const b = getProjectDataset(p);
  assert.deepEqual(
    a.daily.map((d) => d.revenue),
    b.daily.map((d) => d.revenue)
  );
});

test("different projects of the same type show different curves", () => {
  const a = getProjectDataset(project("proj-aaaa", "eshop"));
  const b = getProjectDataset(project("proj-bbbb", "eshop"));
  // Same magnitude family, but the per-project trend + wobble reshape the days.
  const revA = a.daily.map((d) => d.revenue);
  const revB = b.daily.map((d) => d.revenue);
  const diffDays = revA.filter((v, i) => v !== revB[i]).length;
  assert.ok(diffDays > revA.length * 0.5, "at least half the days differ between two projects");
});

test("different TYPES carry different weekday signatures (not one shared curve)", () => {
  // The weekday profile is the type fingerprint. Compare the normalized weekday
  // means of leadgen (weekday-heavy) vs local (weekend-tilted) for the SAME id, so
  // magnitude/efficiency (id-seeded) cancel and only the type shape remains.
  const id = "proj-shared";
  const weekdayMeans = (type) => {
    const data = getProjectDataset(project(id, type));
    const byDow = Array.from({ length: 7 }, () => []);
    for (const d of data.daily) byDow[new Date(`${d.date}T00:00:00Z`).getUTCDay()].push(d.revenue);
    return byDow.map((xs) => sum(xs) / xs.length);
  };
  const lead = weekdayMeans("leadgen");
  const local = weekdayMeans("local");
  // leadgen: a weekday (Wed=3) should out-earn a weekend day (Sat=6).
  assert.ok(lead[3] > lead[6], "leadgen midweek > weekend");
  // local: the weekend (Sat=6) should out-earn a midweek day (Wed=3).
  assert.ok(local[6] > local[3], "local weekend > midweek");
});

test("per-day factors stay within the ±25% envelope for every type", () => {
  const dates = getProjectDataset(project("x", "eshop")).daily.map((d) => d.date);
  for (const type of TYPES) {
    const factors = projectShapeFactors(project(`fac-${type}`, type), dates);
    for (const f of factors) {
      assert.ok(f >= 0.75 - 1e-9 && f <= 1.25 + 1e-9, `${type} factor ${f} out of envelope`);
    }
  }
});

test("cumulative total drift is bounded (shape re-distributes, doesn't inflate)", () => {
  for (const type of TYPES) {
    const p = project(`drift-${type}`, type);
    const scaled = scaledDataset(1, { name: p.name });
    const shaped = applyProjectShape(scaled, p);
    for (const key of ["revenue", "cost", "conversions", "visits"]) {
      const base = total(scaled, key);
      const varied = total(shaped, key);
      const drift = Math.abs(varied - base) / base;
      assert.ok(drift < 0.03, `${type} ${key} total drift ${(drift * 100).toFixed(2)}% exceeds 3%`);
    }
  }
});

test("uniform scaling keeps per-day ratios (ROAS/PNO) pointwise identical", () => {
  const p = project("ratio-1", "leadgen");
  const scaled = scaledDataset(2, { name: p.name }, 1.1);
  const shaped = applyProjectShape(scaled, p);
  let checked = 0;
  for (let i = 0; i < scaled.daily.length; i++) {
    const b = scaled.daily[i];
    const s = shaped.daily[i];
    if (b.cost > 0 && s.cost > 0) {
      const roasBase = b.revenue / b.cost;
      const roasVar = s.revenue / s.cost;
      // Only rounding of already-rounded ints separates them.
      assert.ok(Math.abs(roasBase - roasVar) < 0.05, `ROAS drift at day ${i}: ${roasBase} vs ${roasVar}`);
      checked++;
    }
  }
  assert.ok(checked > 100, "checked a meaningful number of days");
});

test("low-magnitude days never show conversions=0 with cost>0 (ratio-safe)", () => {
  // A tiny scale drives conversions toward 0 while cost stays nonzero — the exact
  // condition that made CPA=cost/0 / conv-rate=0. roundCount floors a positive
  // scaled conversion count at 1, so no spend-day is left with zero conversions.
  const tiny = scaledDataset(0.02, { name: "Small" }, 1.5);
  for (const d of tiny.daily) {
    if (d.cost > 0) assert.ok(d.conversions >= 1, `day ${d.date}: cost>0 but conversions=${d.conversions}`);
  }
  // Same guarantee through the project shape path at a low-type magnitude.
  const shaped = getProjectDataset(project("tiny-content", "content"));
  for (const d of shaped.daily) {
    if (d.cost > 0) assert.ok(d.conversions >= 1, `shaped ${d.date}: cost>0 but conversions=${d.conversions}`);
  }
});

test("non-project path (scaledDataset) is byte-identical — never re-shaped", () => {
  // The microsite/fixed-label callers must be untouched by Direction 1.
  const a = scaledDataset(1.5, { name: "Acme", domain: "acme.cz" }, 1.2);
  const b = scaledDataset(1.5, { name: "Acme", domain: "acme.cz" }, 1.2);
  assert.deepEqual(a, b);
  // And it does NOT match a shaped project of the same scale (proves shape only
  // applies with a Project).
  const p = project("ms-1", "eshop");
  const shaped = applyProjectShape(scaledDataset(1.5, { name: "Acme" }, 1.2), p);
  assert.notDeepEqual(
    a.daily.map((d) => d.revenue),
    shaped.daily.map((d) => d.revenue)
  );
});

test("engine sanity — anomalies + trends over varied curves stay finite and sane", () => {
  // The base demo series already carries authored spike/outage events → a natural
  // anomaly count. The shape layer must stay in that neighbourhood (the mean-1 tilt
  // + de-seasonalising engine + small wobble), never explode it into noise.
  const baseData = scaledDataset(1, { name: "base" });
  const baseCount = detectAnomalies(baseData.daily, { pno: baseData.goals.pno }).length;
  assert.ok(baseCount > 0, "base series has a baseline of authored anomalies");

  for (const type of TYPES) {
    const data = getProjectDataset(project(`eng-${type}`, type));
    const anomalies = detectAnomalies(data.daily, { pno: data.goals.pno });
    // No NaN/Infinity leaking through the shape layer.
    for (const a of anomalies) {
      assert.ok(Number.isFinite(a.z), `${type} anomaly z not finite`);
      assert.ok(Number.isFinite(a.observed) && Number.isFinite(a.expected), `${type} anomaly value not finite`);
    }
    // Within a sane band of the base count — the small wobble may nudge a few in or
    // out, but the varied curve never manufactures a flood of false anomalies.
    assert.ok(
      anomalies.length <= baseCount * 1.3,
      `${type} produced ${anomalies.length} anomalies vs base ${baseCount} — exploding`
    );

    const trends = detectTrends(data.daily);
    for (const tr of trends) {
      assert.ok(Number.isFinite(tr.cumulativeChange), `${type} trend cumulativeChange not finite`);
    }
  }
});
