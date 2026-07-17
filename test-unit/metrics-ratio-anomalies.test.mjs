/** Direction 1: CTR/CPC (paid-traffic ratio) anomalies enter the engine on the
 *  day-ratio series. Proves a CTR collapse fires, a CPC spike fires, and a legacy
 *  series without impressions/clicks silently produces no ratio anomalies. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAnomalies } from "@/lib/metrics/anomalies";

/** 60 flat days (full coverage) with impressions/clicks carrying a small
 *  deterministic wiggle so the baseline CTR/CPC has real (non-zero) variance. */
function paidSeries(mutateLast) {
  const out = [];
  const base = new Date("2026-01-05T00:00:00Z").getTime();
  for (let i = 0; i < 60; i++) {
    const iso = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    const p = {
      date: iso,
      visits: 1000,
      impressions: 10000,
      clicks: 300 + (i % 5) * 2, // CTR ~3.00–3.08 %
      cost: 3000 + (i % 3) * 10, // CPC ~10 CZK with a little wiggle
      conversions: 40,
      revenue: 12000,
    };
    if (i === 59) mutateLast(p);
    out.push(p);
  }
  return out;
}

test("a CTR collapse (clicks fall, impressions hold) fires a ctr anomaly", () => {
  const daily = paidSeries((p) => {
    p.clicks = 90; // CTR 0.9 % vs a ~3 % baseline — a collapse
  });
  const anomalies = detectAnomalies(daily, { pno: 0.18 });
  const ctr = anomalies.find((a) => a.metric === "ctr" && a.date === daily[59].date);
  assert.ok(ctr, "the CTR collapse is flagged");
  assert.ok(ctr.kind === "drop" || ctr.kind === "outage", `ctr collapse is a drop/outage (${ctr?.kind})`);
  assert.ok(ctr.z < 0, "signed negative — a fall, not a rise");
});

test("a CPC spike (cost jumps on steady clicks) fires a cpc anomaly", () => {
  const daily = paidSeries((p) => {
    p.cost = 15000; // CPC ~50 CZK vs a ~10 CZK baseline — a spike
  });
  const anomalies = detectAnomalies(daily, { pno: 0.18 });
  const cpc = anomalies.find((a) => a.metric === "cpc" && a.date === daily[59].date);
  assert.ok(cpc, "the CPC spike is flagged");
  assert.equal(cpc.kind, "spike");
  assert.ok(cpc.z > 0, "signed positive — a rise");
});

test("a day that scales impressions AND clicks together keeps CTR quiet", () => {
  // Doubling both keeps the ratio normal — the day-ratio detector must NOT fire a
  // false CTR anomaly (the whole point of scoring the ratio, not the components).
  const daily = paidSeries((p) => {
    p.impressions = 20000;
    p.clicks = 600; // CTR still 3 %
  });
  const anomalies = detectAnomalies(daily, { pno: 0.18 });
  assert.equal(
    anomalies.some((a) => a.metric === "ctr" && a.date === daily[59].date),
    false,
    "no false CTR anomaly when the ratio is unchanged"
  );
});

/** 60 days where the paid channel LAUNCHES on day `launchAt`: earlier days carry no
 *  impressions/clicks (the pair is absent), later days a steady ~3 % CTR. */
function launchingPaidSeries(launchAt, mutateLast) {
  const out = [];
  const base = new Date("2026-01-05T00:00:00Z").getTime();
  for (let i = 0; i < 60; i++) {
    const iso = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    const p = { date: iso, visits: 1000, cost: 0, conversions: 40, revenue: 12000 };
    if (i >= launchAt) {
      p.impressions = 10000;
      p.clicks = 300 + (i % 5) * 2; // CTR ~3.00–3.08 %
      p.cost = 3000 + (i % 3) * 10;
    }
    if (i === 59) mutateLast?.(p);
    out.push(p);
  }
  return out;
}

test("a paid channel that launches mid-series steady fires no false ratio spike", () => {
  // Before the present-only baseline fix, the absent pre-launch days entered the CTR
  // baseline as ctr(0,0)=0 placeholders, halving the mean and inflating std so the
  // first real launch days read as huge spikes. A steady post-launch CTR must be quiet.
  const daily = launchingPaidSeries(30);
  const anomalies = detectAnomalies(daily, { pno: 0.18 });
  assert.equal(
    anomalies.some((a) => a.metric === "ctr" || a.metric === "cpc"),
    false,
    "no false ratio anomaly from zero placeholders on the pre-launch days"
  );
});

test("a genuine CTR collapse on a mid-launch channel still fires", () => {
  // The present-only baseline must not over-suppress: a real collapse after enough
  // present days still scores against the present-day baseline.
  const daily = launchingPaidSeries(20, (p) => {
    p.clicks = 90; // CTR 0.9 % vs a ~3 % present baseline
  });
  const anomalies = detectAnomalies(daily, { pno: 0.18 });
  const ctr = anomalies.find((a) => a.metric === "ctr" && a.date === daily[59].date);
  assert.ok(ctr, "the collapse is still flagged against the present-day baseline");
  assert.ok(ctr.z < 0, "signed negative — a fall");
});

test("a legacy series without impressions/clicks produces no ratio anomalies", () => {
  const daily = paidSeries((p) => {
    p.clicks = 90;
  }).map(({ impressions, clicks, ...rest }) => rest); // strip the paid-traffic pair
  const anomalies = detectAnomalies(daily, { pno: 0.18 });
  assert.equal(
    anomalies.some((a) => a.metric === "ctr" || a.metric === "cpc"),
    false,
    "the ratio pass silently degrades on legacy data — no false anomalies"
  );
});
