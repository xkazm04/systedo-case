/** Direction 3 — the per-user throttle now guarding the expensive workspace write
 *  routes (leads/import, local-signals/import, metrics/sync, twin/send). Pins the
 *  limit decisions: allow up to the configured cap, then a 429 with Retry-After;
 *  each rule has an independent budget; per-user isolation; and the env knobs +
 *  default caps that back each route. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceUserRate, WORKSPACE_RATE } from "@/lib/api/route-utils";

test("enforceUserRate: allows up to the limit, then 429s with Retry-After", () => {
  process.env.LEADS_IMPORT_PER_MIN = "3";
  const rule = WORKSPACE_RATE.leadsImport();
  const uid = "wr-user-a";
  assert.equal(enforceUserRate(uid, rule, "stop"), null);
  assert.equal(enforceUserRate(uid, rule, "stop"), null);
  assert.equal(enforceUserRate(uid, rule, "stop"), null);
  const blocked = enforceUserRate(uid, rule, "stop");
  assert.ok(blocked, "4th request should be blocked");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
});

test("enforceUserRate: each user has an independent budget", () => {
  process.env.TWIN_SEND_PER_MIN = "1";
  const rule = WORKSPACE_RATE.twinSend();
  assert.equal(enforceUserRate("wr-user-b", rule, "stop"), null); // b's first — ok
  assert.ok(enforceUserRate("wr-user-b", rule, "stop")); // b's second — blocked
  assert.equal(enforceUserRate("wr-user-c", rule, "stop"), null); // c unaffected
});

test("WORKSPACE_RATE: distinct buckets don't share a budget", () => {
  process.env.METRICS_SYNC_PER_MIN = "1";
  process.env.LOCAL_SIGNALS_IMPORT_PER_MIN = "1";
  const uid = "wr-user-d";
  // Exhaust metrics:sync — must NOT touch the local-signals:import budget.
  assert.equal(enforceUserRate(uid, WORKSPACE_RATE.metricsSync(), "stop"), null);
  assert.ok(enforceUserRate(uid, WORKSPACE_RATE.metricsSync(), "stop"));
  assert.equal(enforceUserRate(uid, WORKSPACE_RATE.localSignalsImport(), "stop"), null);
});

test("WORKSPACE_RATE: env-tunable, sane defaults, 60s window", () => {
  delete process.env.LEADS_IMPORT_PER_MIN;
  delete process.env.LOCAL_SIGNALS_IMPORT_PER_MIN;
  delete process.env.METRICS_SYNC_PER_MIN;
  delete process.env.TWIN_SEND_PER_MIN;
  delete process.env.TWIN_COMMIT_PER_MIN;
  assert.equal(WORKSPACE_RATE.leadsImport().limit, 8);
  assert.equal(WORKSPACE_RATE.localSignalsImport().limit, 8);
  assert.equal(WORKSPACE_RATE.metricsSync().limit, 12);
  assert.equal(WORKSPACE_RATE.twinSend().limit, 20);
  assert.equal(WORKSPACE_RATE.twinCommit().limit, 30, "the slice-commit write path is capped");
  assert.equal(WORKSPACE_RATE.metricsSync().windowMs, 60_000);
  // buckets are distinct so the routes never cross-consume
  const buckets = [
    WORKSPACE_RATE.leadsImport().bucket,
    WORKSPACE_RATE.localSignalsImport().bucket,
    WORKSPACE_RATE.metricsSync().bucket,
    WORKSPACE_RATE.twinSend().bucket,
    WORKSPACE_RATE.twinCommit().bucket,
  ];
  assert.equal(new Set(buckets).size, 5);
});
