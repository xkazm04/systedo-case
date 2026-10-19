/** "Cheap" in the spam / mis-targeting split is relative to the peer median CPL and to
 *  the source's own prior CPL (technique cheap-cpl-splits-spam-from-mistargeting); the
 *  absolute CZK anchor only stands in when fewer than two paid peers have a CPL. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCause, isCheapCpl } from "@/lib/ai/tools/lead-source-diagnosis";
import { SAMPLE_SOURCES } from "@/lib/lead-quality/sample";
import { withMetrics, sourceTrend } from "@/lib/lead-quality/compute";
import { toLeadSourceSeed, seedToRequest } from "@/lib/diagnoses/lead-source-request";

const base = { source: "X", leads: 100, qualified: 10, won: 1, qualRate: 0.1, winRate: 0.1, spend: 10_000 };
const peers = [
  { source: "A", qualRate: 0.6, winRate: 0.2, cpl: 400 },
  { source: "B", qualRate: 0.5, winRate: 0.2, cpl: 440 },
];

test("under half the peer median and no prior: cheap, so spam", () => {
  const req = { ...base, cpl: 150, peers };
  assert.equal(isCheapCpl(150, req), true);
  assert.equal(pickCause(req), "spam");
});

test("an expensive-market source under the absolute anchor is NOT cheap against its peers", () => {
  const req = { ...base, cpl: 190, peers: peers.map((p) => ({ ...p, cpl: 300 })) }; // 190 <= 200 absolute, but 190 > 0.5 * 300
  assert.equal(pickCause(req), "mis-targeting");
});

test("a cheap-market source over the absolute anchor IS cheap against its peers", () => {
  const cheapPeers = peers.map((p) => ({ ...p, cpl: 900 }));
  const req = { ...base, cpl: 300, peers: cheapPeers };
  assert.equal(pickCause(req), "spam");
});

test("CPL that rose against its own prior is not cheapening", () => {
  const req = { ...base, cpl: 150, peers, trend: { cpqlDelta: 0, qualRateDelta: 0, winRateDelta: 0, cplDelta: 0.2 } };
  assert.equal(pickCause(req), "mis-targeting");
});

test("fewer than two paid peers falls back to the demo anchor", () => {
  const one = { ...base, cpl: 150, peers: [peers[0]] };
  assert.equal(pickCause(one), "spam");
  assert.equal(pickCause({ ...base, cpl: 250, peers: [peers[0]] }), "mis-targeting");
});

test("unpaid source is never cheap (not measured is not cheap)", () => {
  const unpaid = { ...base, spend: 0 };
  assert.equal(pickCause({ ...unpaid, peers }), "mis-targeting");
});

test("the seed threads peer CPL and cplDelta end to end", () => {
  const rows = SAMPLE_SOURCES.map(withMetrics);
  const meta = rows.find((r) => r.source.startsWith("Meta"));
  const req = seedToRequest(toLeadSourceSeed(meta, rows));
  const paid = req.peers.filter((p) => p.cpl !== undefined);
  assert.ok(paid.length >= 2 && paid.every((p) => p.cpl > 0)); // unpaid peers carry no CPL
  assert.equal(pickCause(req), "mis-targeting"); // sample Meta: CPL rose vs its own prior, so not cheapening
  assert.ok(Math.abs(req.trend.cplDelta - sourceTrend(meta).cplDelta) < 1e-9);
});
