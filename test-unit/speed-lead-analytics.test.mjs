/** Unit tests for the speed-to-lead response analytics. Runs the TS source
 *  directly via the shared resolve hook (node --import ./test-llm/setup.mjs). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { median, computeResponseAnalytics } from "@/lib/speed-lead/analytics";

test("median handles empty, odd and even lengths (non-mutating)", () => {
  assert.equal(median([]), null);
  assert.equal(median([7]), 7);
  assert.equal(median([3, 1, 2]), 2); // sorted → 1,2,3
  assert.equal(median([4, 1, 3, 2]), 2.5); // sorted → 1,2,3,4
  const src = [3, 1, 2];
  median(src);
  assert.deepEqual(src, [3, 1, 2]); // input untouched
});

test("computeResponseAnalytics scores answered leads against the 5-min SLA", () => {
  const a = computeResponseAnalytics([
    { channel: "form", responseSec: 120, breached: false }, // 2 min → hit
    { channel: "call", responseSec: 600, breached: false }, // 10 min → miss
  ]);
  assert.equal(a.medianResponseSec, 360); // (120+600)/2
  assert.equal(a.answered, 2);
  assert.equal(a.judged, 2);
  assert.equal(a.withinSlaRate, 0.5);
});

test("only SETTLED outcomes are judged; an open on-track lead is at-risk, not a hit", () => {
  const a = computeResponseAnalytics([
    { channel: "chat", responseSec: 60, breached: false }, // answered hit
    { channel: "email", responseSec: null, breached: false }, // open, on track → at risk
    { channel: "email", responseSec: null, breached: true }, // open, breached → miss
  ]);
  assert.equal(a.answered, 1);
  assert.equal(a.medianResponseSec, 60); // only the answered one
  assert.equal(a.judged, 2); // the hit + the breached miss; the open on-track lead is NOT judged
  assert.equal(a.atRisk, 1);
  assert.equal(a.withinSlaRate, 0.5); // 1 hit / 2 settled
});

test("all-fresh inbox: no verdicts yet → null rate, not a flattering 100%", () => {
  const a = computeResponseAnalytics([
    { channel: "form", responseSec: null, breached: false },
    { channel: "call", responseSec: null, breached: false },
  ]);
  assert.equal(a.withinSlaRate, null); // was 1.0 under the old optimistic rule
  assert.equal(a.judged, 0);
  assert.equal(a.atRisk, 2);
});

test("byChannel averages only answered leads; no data → null rate", () => {
  const a = computeResponseAnalytics([
    { channel: "form", responseSec: 100, breached: false },
    { channel: "form", responseSec: 300, breached: false },
    { channel: "call", responseSec: 240, breached: false },
  ]);
  const form = a.byChannel.find((c) => c.channel === "form");
  const call = a.byChannel.find((c) => c.channel === "call");
  assert.equal(form.avgResponseSec, 200);
  assert.equal(form.answered, 2);
  assert.equal(call.avgResponseSec, 240);

  const empty = computeResponseAnalytics([]);
  assert.equal(empty.withinSlaRate, null);
  assert.equal(empty.medianResponseSec, null);
  assert.deepEqual(empty.byChannel, []);
});
