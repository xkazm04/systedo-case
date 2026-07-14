/** Unit tests for summarizeDelivery (src/lib/email.ts) — the pure decision the
 *  report cron uses to decide whether to mark a period as sent. The rule that
 *  matters: mark sent iff >= 1 recipient was actually delivered, so a total
 *  failure leaves lastSentDay unset and the next run retries. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeDelivery } from "@/lib/email";

test("all delivered → marks sent, no failures", () => {
  assert.deepEqual(summarizeDelivery([true, true, true]), {
    delivered: 3,
    failed: 0,
    shouldMarkSent: true,
  });
});

test("partial delivery → still marks sent (>=1 got it)", () => {
  assert.deepEqual(summarizeDelivery([true, false, false]), {
    delivered: 1,
    failed: 2,
    shouldMarkSent: true,
  });
});

test("TOTAL failure → does NOT mark sent, so the next run retries", () => {
  assert.deepEqual(summarizeDelivery([false, false]), {
    delivered: 0,
    failed: 2,
    shouldMarkSent: false,
  });
});

test("empty recipient list → nothing delivered, not marked sent", () => {
  assert.deepEqual(summarizeDelivery([]), {
    delivered: 0,
    failed: 0,
    shouldMarkSent: false,
  });
});

test("single success → marks sent", () => {
  assert.deepEqual(summarizeDelivery([true]), {
    delivered: 1,
    failed: 0,
    shouldMarkSent: true,
  });
});
