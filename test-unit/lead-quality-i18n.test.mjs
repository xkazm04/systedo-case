/** Direction 1 — the funnel + drift alerts speak both languages. Verifies the
 *  localized stage labels and alert copy: the default (cs) path is byte-identical
 *  to the former hard-coded Czech literals, and an `en` locale yields English.
 *  Runs the TS source directly via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sourceFunnel,
  funnelBySource,
  sourceTrend,
  sourceAlerts,
  periodAlerts,
} from "@/lib/lead-quality/compute";
import { fmtCZK } from "@/lib/format";

const full = {
  source: "Google Ads",
  leads: 320,
  qualified: 198,
  won: 41,
  spend: 142_000,
  revenue: 1_640_000,
  opportunities: 96,
};

// A paid source whose CPQL both rose >25 % and blew past the 900 CZK target →
// fires the rise + target alerts.
const drifting = {
  source: "Meta",
  leads: 100,
  qualified: 1,
  won: 0,
  spend: 1000,
  revenue: 0,
  prior: { leads: 100, qualified: 1, won: 0, spend: 500 },
};

test("stage labels: cs default is byte-identical, en spells them out", () => {
  const cs = sourceFunnel(full); // default cs
  assert.deepEqual(
    cs.stages.map((s) => s.label),
    ["Lead", "SQL", "Příležitost", "Uzavřeno"],
  );
  const csExplicit = sourceFunnel(full, "cs");
  assert.deepEqual(csExplicit.stages.map((s) => s.label), cs.stages.map((s) => s.label));

  const en = sourceFunnel(full, "en");
  assert.deepEqual(
    en.stages.map((s) => s.label),
    ["Lead", "SQL", "Opportunity", "Won"],
  );
});

test("funnelBySource threads the locale to every source", () => {
  const en = funnelBySource([full], "en");
  assert.equal(en[0].stages.at(-1).label, "Won");
  const cs = funnelBySource([full]);
  assert.equal(cs[0].stages.at(-1).label, "Uzavřeno");
});

test("alert copy: cs default is byte-identical to the former literals", () => {
  const tr = sourceTrend(drifting);
  const alerts = sourceAlerts(tr); // default cs
  const rise = alerts.find((a) => a.kind === "cpql-rise");
  const target = alerts.find((a) => a.kind === "cpql-target");
  assert.equal(rise.message, "CPQL zdroje „Meta” vzrostlo o 100 % oproti minulému období.");
  assert.equal(
    target.message,
    `CPQL zdroje „Meta” (${fmtCZK(1000)}) překračuje cíl ${fmtCZK(900)}.`,
  );
  // Explicit cs matches the default.
  assert.deepEqual(sourceAlerts(tr, {}, "cs").map((a) => a.message), alerts.map((a) => a.message));
});

test("alert copy: en yields English with USD currency", () => {
  const tr = sourceTrend(drifting);
  const alerts = sourceAlerts(tr, {}, "en");
  const rise = alerts.find((a) => a.kind === "cpql-rise");
  const target = alerts.find((a) => a.kind === "cpql-target");
  assert.match(rise.message, /rose by 100 % vs\. the previous period/);
  assert.match(rise.message, /Meta/);
  assert.match(target.message, /exceeds the target/);
  assert.match(target.message, /\$/); // USD formatting for en
});

test("periodAlerts threads the locale across sources", () => {
  const cs = periodAlerts([drifting]);
  const en = periodAlerts([drifting], {}, "en");
  assert.equal(cs.length, en.length);
  assert.ok(cs.length >= 2);
  assert.ok(cs.every((a) => a.message.includes("zdroje")));
  assert.ok(en.every((a) => a.message.includes("source")));
});
