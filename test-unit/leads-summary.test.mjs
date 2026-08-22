/** The CRM aggregate (src/lib/leads/summary.ts + sla.ts): the counts a module can
 *  render above a thousand-row list, and the honesty rails around them. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { summarizeContacts, regionLabel } = await import("@/lib/leads/summary");
const { urgentQueue, contactSla, LEAD_SLA_TARGET_MIN, URGENT_QUEUE_CAP } = await import("@/lib/leads/sla");

const NOW = Date.parse("2026-08-22T12:00:00.000Z");
const MIN = 60_000;

function contact(over = {}) {
  const seen = new Date(NOW - 5 * MIN).toISOString();
  return {
    id: "c1",
    projectId: "p1",
    stage: "new",
    stageEnteredAt: seen,
    attribution: { source: "google-ads" },
    consent: [],
    tags: [],
    firstSeenAt: seen,
    lastActivityAt: seen,
    createdAt: seen,
    updatedAt: seen,
    ...over,
  };
}

test("counts by stage, source and grade; unscored contacts are counted, not dropped", () => {
  const s = summarizeContacts(
    [
      contact({ id: "a", stage: "new", score: { fit: 80, engagement: 70, grade: "A", computedAt: "" } }),
      contact({ id: "b", stage: "won", attribution: { source: "sklik" } }),
      contact({ id: "c", stage: "new", attribution: { source: "sklik" } }),
    ],
    NOW
  );
  assert.equal(s.scanned, 3);
  assert.equal(s.byStage.new, 2);
  assert.equal(s.byStage.won, 1);
  assert.equal(s.byGrade.A, 1);
  assert.equal(s.byGrade.none, 2, "a contact that was never scored still exists");
  assert.deepEqual(s.bySource[0], { label: "Sklik", count: 2 }, "biggest source first");
});

test("SLA tally splits breached / warning / ontrack, and a replied contact is settled", () => {
  const old = new Date(NOW - 60 * MIN).toISOString();
  const s = summarizeContacts(
    [
      contact({ id: "breached", firstSeenAt: old }),
      contact({ id: "fresh", firstSeenAt: new Date(NOW - 1 * MIN).toISOString() }),
      contact({ id: "answered", firstSeenAt: old, firstRespondedAt: new Date(NOW - 55 * MIN).toISOString() }),
    ],
    NOW
  );
  assert.equal(s.sla.breached, 1);
  assert.equal(s.sla.ontrack, 1);
  assert.equal(s.sla.settled, 1);
  assert.equal(s.analytics.waiting, 2, "only unanswered contacts are waiting");
  assert.equal(s.analytics.medianResponseMin, 5, "median is measured, not guessed");
});

test("regions are never invented — no location field means no regional breakdown", () => {
  const none = summarizeContacts([contact()], NOW);
  assert.deepEqual(none.byRegion, []);

  assert.equal(regionLabel(contact({ region: "Jihomoravský" })), "Jihomoravský");
  assert.equal(regionLabel(contact({ city: "Brno" })), "Brno", "city when no region");
  assert.equal(regionLabel(contact({ postalCode: "602 00" })), "602xx", "a bare PSČ groups by district");
  assert.equal(regionLabel(contact({ postalCode: "60" })), null, "too short to locate anything");

  const withRegions = summarizeContacts(
    [contact({ id: "a", city: "Brno" }), contact({ id: "b", city: "Brno" }), contact({ id: "c", region: "Praha" })],
    NOW
  );
  assert.deepEqual(withRegions.byRegion, [
    { label: "Brno", count: 2 },
    { label: "Praha", count: 1 },
  ]);
});

test("a capped scan says so — a slice must never read as the whole project", () => {
  const s = summarizeContacts([contact()], NOW, true);
  assert.equal(s.capped, true);
  assert.equal(s.scanned, 1);
});

test("the urgent queue is CAPPED and deadline-ordered, and reports its overflow", () => {
  const many = Array.from({ length: URGENT_QUEUE_CAP + 7 }, (_, i) =>
    contact({ id: `c${i}`, firstSeenAt: new Date(NOW - (100 - i) * MIN).toISOString() })
  );
  const { rows, overflow } = urgentQueue(many, NOW);
  assert.equal(rows.length, URGENT_QUEUE_CAP);
  assert.equal(overflow, 7, "what did not fit is surfaced, not silently dropped");
  assert.equal(rows[0].id, "c0", "the oldest deadline is the most urgent");
  assert.equal(contactSla(rows[0], NOW).phase, "breached");
});

test("an answered or terminal contact is not queue work", () => {
  const seen = new Date(NOW - 90 * MIN).toISOString();
  const { rows } = urgentQueue(
    [
      contact({ id: "answered", firstSeenAt: seen, firstRespondedAt: seen }),
      contact({ id: "lost", firstSeenAt: seen, stage: "lost" }),
      contact({ id: "open", firstSeenAt: seen }),
    ],
    NOW
  );
  assert.deepEqual(rows.map((r) => r.id), ["open"]);
});

test("the SLA target is a stated number, not a magic constant", () => {
  assert.equal(typeof LEAD_SLA_TARGET_MIN, "number");
  const c = contact({ firstSeenAt: new Date(NOW).toISOString() });
  assert.equal(contactSla(c, NOW).remainingMin, LEAD_SLA_TARGET_MIN);
});
