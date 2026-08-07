/** retryRevert: the send route's connector-failure path. The approved→sent claim is
 *  optimistic (it lands BEFORE delivery); when the connector throws, the revert must
 *  be retried — a swallowed revert failure used to strand a permanently-"sent" draft
 *  that never left the building. These pin: retry until success, bounded attempts,
 *  and an honest `false` (never silence) when every attempt fails. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { retryRevert, REVERT_ATTEMPTS } from "@/lib/twin/send-claim";

test("retryRevert: a clean revert succeeds on the first attempt", async () => {
  let calls = 0;
  const ok = await retryRevert(async () => {
    calls++;
  });
  assert.equal(ok, true);
  assert.equal(calls, 1);
});

test("retryRevert: a transient failure is retried until the revert lands", async () => {
  let calls = 0;
  const errors = [];
  const ok = await retryRevert(
    async () => {
      calls++;
      if (calls < 3) throw new Error(`hiccup ${calls}`);
    },
    3,
    (err, attempt) => errors.push({ err: String(err), attempt })
  );
  assert.equal(ok, true, "the third attempt landed");
  assert.equal(calls, 3);
  assert.deepEqual(
    errors.map((e) => e.attempt),
    [1, 2],
    "each failed attempt is reported, the successful one is not"
  );
});

test("retryRevert: exhausted attempts return false — the caller must log the strand", async () => {
  let calls = 0;
  const ok = await retryRevert(
    async () => {
      calls++;
      throw new Error("store down");
    },
    REVERT_ATTEMPTS
  );
  assert.equal(ok, false, "a stranded claim is reported, never swallowed");
  assert.equal(calls, REVERT_ATTEMPTS, "attempts are bounded");
});

test("retryRevert: default attempt budget is the exported constant", async () => {
  let calls = 0;
  await retryRevert(async () => {
    calls++;
    throw new Error("x");
  });
  assert.equal(calls, REVERT_ATTEMPTS);
});
