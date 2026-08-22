/** The CRM aggregate (src/lib/leads/summary.ts + sla.ts): the counts a module can
 *  render above a thousand-row list, and the honesty rails around them. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { summarizeContacts, regionLabel, MATRIX_SOURCE_CAP } = await import("@/lib/leads/summary");
const { contactsToLeadSources } = await import("@/lib/leads/aggregate");
const { withMetrics } = await import("@/lib/lead-quality/compute");
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

/* ── the source × stage cross-tabulation (the segment map's data) ───────────── */

const scored = (grade) => ({ fit: 80, engagement: 80, grade, computedAt: "" });

test("the matrix cross-tabulates source × stage on the SAME scan", () => {
  const old = new Date(NOW - 90 * MIN).toISOString();
  const s = summarizeContacts(
    [
      contact({ id: "a", stage: "new", firstSeenAt: old, score: scored("A") }),
      contact({ id: "b", stage: "new" }),
      contact({ id: "c", stage: "won", attribution: { source: "sklik" } }),
      contact({ id: "d", stage: "lost", attribution: { source: "sklik" } }),
    ],
    NOW
  );

  const ads = s.matrix.find((r) => r.label === "Google Ads");
  assert.equal(ads.total, 2);
  assert.equal(ads.cells.new.count, 2);
  assert.equal(ads.cells.new.breached, 1, "only the overdue, unanswered one is breached");
  assert.equal(ads.cells.new.ab, 1);
  assert.equal(ads.cells.new.value, null, "no deal tier supplied ⇒ unknown, never a fabricated 0");

  const sklik = s.matrix.find((r) => r.label === "Sklik");
  assert.equal(sklik.total, 2, "a lost contact still belongs to its source");
  assert.equal(sklik.terminal, 1);
  assert.equal(sklik.cells.won.count, 1);

  // The cross-tab must reconcile with the flat breakdowns it sits beside.
  const cellSum = s.matrix.reduce(
    (a, r) => a + Object.values(r.cells).reduce((x, c) => x + c.count, 0),
    0
  );
  assert.equal(cellSum, s.scanned, "every scanned contact lands in exactly one cell");
  for (const row of s.matrix) {
    assert.equal(row.total, s.bySource.find((b) => b.label === row.label).count);
  }
});

test("winRate in the matrix IS lead-quality's winRate — one funnel, computed twice", () => {
  const contacts = [
    contact({ id: "a", stage: "qualified" }),
    contact({ id: "b", stage: "opportunity" }),
    contact({ id: "c", stage: "won" }),
    contact({ id: "d", stage: "new" }),
    contact({ id: "e", stage: "lost" }),
  ];
  const row = summarizeContacts(contacts, NOW).matrix[0];
  const funnel = withMetrics(contactsToLeadSources(contacts)[0]);

  assert.equal(row.total, funnel.leads, "row total = the funnel's entered leads");
  assert.equal(row.qualified, funnel.qualified, "cumulative at lead-quality's ranks");
  assert.equal(row.won, funnel.won);
  assert.equal(row.winRate, funnel.winRate);
});

test("a win rate over nothing is unknown, not 0 %", () => {
  const row = summarizeContacts([contact({ stage: "new" })], NOW).matrix[0];
  assert.equal(row.qualified, 0);
  assert.equal(row.winRate, null);
});

test("deal values are summed only when the caller actually has them", () => {
  const s = summarizeContacts([contact({ id: "a", stage: "opportunity" })], NOW, false, {
    dealValueByContact: new Map([["a", 250_000]]),
  });
  assert.equal(s.matrix[0].cells.opportunity.value, 250_000);
});

test("the matrix is capped, and what did not fit is disclosed rather than dropped", () => {
  const many = Array.from({ length: MATRIX_SOURCE_CAP + 3 }, (_, i) =>
    contact({ id: `c${i}`, attribution: { source: `src-${i}` } })
  );
  const s = summarizeContacts(many, NOW);
  assert.equal(s.matrix.length, MATRIX_SOURCE_CAP);
  assert.equal(s.matrixOther.sources, 3);
  assert.equal(s.matrixOther.count, 3);
  assert.equal(s.bySourceGrade.length, MATRIX_SOURCE_CAP + 3, "the grade mix covers every source");
});

test("bySourceGrade reports the A/B share per source", () => {
  const s = summarizeContacts(
    [
      contact({ id: "a", score: scored("A") }),
      contact({ id: "b", score: scored("B") }),
      contact({ id: "c", score: scored("D") }),
      contact({ id: "d" }),
    ],
    NOW
  );
  assert.deepEqual(s.bySourceGrade, [{ label: "Google Ads", count: 4, ab: 2, abShare: 0.5 }]);
});

test("the SLA target is a stated number, not a magic constant", () => {
  assert.equal(typeof LEAD_SLA_TARGET_MIN, "number");
  const c = contact({ firstSeenAt: new Date(NOW).toISOString() });
  assert.equal(contactSla(c, NOW).remainingMin, LEAD_SLA_TARGET_MIN);
});
