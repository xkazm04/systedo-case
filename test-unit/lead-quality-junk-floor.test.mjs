/** The junk badge is one predicate with one threshold and the diagnosis's own sample
 *  floor (technique junk-source-rule): a paid source under the floor is never junk,
 *  because its diagnosis already says "too little data". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMetrics, summarize, MIN_LEADS_FOR_VERDICT } from "@/lib/lead-quality/compute";
import { pickCause } from "@/lib/ai/tools/lead-source-diagnosis";
import { toLeadSourceSeed, seedToRequest } from "@/lib/diagnoses/lead-source-request";
import { leadSignalsText } from "@/lib/lead-signals/summary";
import { SAMPLE_SOURCES } from "@/lib/lead-quality/sample";

const row = (source, leads, qualified, spend) => ({ source, leads, qualified, won: 0, spend, revenue: 0 });

test("a paid source under the sample floor is not junk, and its diagnosis reads volume", () => {
  const rows = [row("Small", MIN_LEADS_FOR_VERDICT - 1, 2, 3_000), row("Peer", 200, 120, 40_000)].map(withMetrics);
  assert.equal(rows[0].junk, false);
  assert.equal(pickCause(seedToRequest(toLeadSourceSeed(rows[0], rows))), "volume");
});

test("at the floor the same rates are junk", () => {
  assert.equal(withMetrics(row("At", MIN_LEADS_FOR_VERDICT, 3, 3_000)).junk, true);
});

test("no row is junk while its diagnosis says volume", () => {
  const sources = [row("A", 22, 5, 9_000), row("B", 12, 2, 3_000), row("C", 8, 1, 1_500), row("D", 45, 12, 8_000)];
  const rows = sources.map(withMetrics);
  for (const r of rows) {
    if (r.junk) assert.notEqual(pickCause(seedToRequest(toLeadSourceSeed(r, rows))), "volume", r.source);
  }
  assert.equal(summarize(sources).junkCount, 1);
});

test("the recap does not name a junk source scaled under the floor", () => {
  const txt = leadSignalsText(SAMPLE_SOURCES, { targetLeads: 50, live: false });
  assert.match(txt, /Žádný placený zdroj není označen jako junk/);
});
