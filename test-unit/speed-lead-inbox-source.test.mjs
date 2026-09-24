/** Speed-to-lead inbox over the REAL CRM queue (challenge card lead-B).
 *
 *  Pins the pure contact → inbox mapping (`lib/speed-lead/inbox-source.ts`), the
 *  BANT sanitiser, the qualify patch that never regresses a stage, the PII rule for
 *  the twin-reply request (docs/leads/design.md §7 "No lead PII in the LLM
 *  chokepoint": a live CRM contact gets NO AI request, a sample lead keeps one), and
 *  — over a temp LOCAL_DB — that a stored qualification reaches the engagement axis
 *  on both scoring call sites, plus the sample↔live seam of `resolveInboxLeads`.
 *
 *  Harness: a temp db keyed by pid + SYSTEDO_DB_FILE + LOCAL_DB set BEFORE the
 *  dynamic imports (the leads-conversion-ledger shape). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-speed-lead-inbox-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { contactToInboundLead, inboxLeadsFromContacts, qualifyPatch, seedResponded, isLeadOverdue, twinReplyRequestFor } =
  await import("@/lib/speed-lead/inbox-source");
const { sanitizeQualification } = await import("@/lib/speed-lead/qualification");
const { resolveInboxLeads } = await import("@/lib/speed-lead/resolve-inbox");
const { SAMPLE_LEADS, LOCAL_SAMPLE_LEADS } = await import("@/lib/speed-lead/sample");
const { LEAD_SLA_TARGET_MIN, URGENT_QUEUE_CAP } = await import("@/lib/leads/sla");
const { applyLeadEvent } = await import("@/lib/leads/apply");
const { patchContact } = await import("@/lib/leads/mutate");
const { getContact } = await import("@/lib/leads/store");

const NOW = new Date("2026-09-24T09:00:00.000Z");
const nowMs = NOW.getTime();
const minAgo = (m) => new Date(nowMs - m * 60_000).toISOString();

let seq = 0;
const pid = () => `p-inbox-${process.pid}-${++seq}`;

const contact = (id, over = {}) => ({
  id,
  projectId: "p",
  stage: "new",
  stageEnteredAt: minAgo(12),
  attribution: { source: "meta-lead-form" },
  consent: [],
  tags: [],
  firstSeenAt: minAgo(12),
  lastActivityAt: minAgo(12),
  createdAt: minAgo(12),
  updatedAt: minAgo(12),
  ...over,
});

const HOT = { timeline: "asap", budget: "confirmed", scope: "large", disposition: "hot" };

/* ── pure mapping ────────────────────────────────────────────────────────────── */

test("contactToInboundLead maps a CRM contact onto the inbox row, on the queue's own 15-min target", () => {
  const lead = contactToInboundLead(contact("c1", { notes: "Chci nabídku" }), nowMs);
  assert.equal(lead.id, "c1");
  assert.equal(lead.contactId, "c1");
  assert.equal(lead.channel, "form");
  assert.equal(lead.message, "Chci nabídku");
  assert.equal(lead.minutesAgo, 12);
  assert.equal(lead.slaTargetMin, LEAD_SLA_TARGET_MIN);
  assert.equal(LEAD_SLA_TARGET_MIN, 15);
  assert.equal(lead.respondedSec, undefined, "an unanswered contact carries no response time");
});

test("a contact answered 3 min after arrival carries respondedSec 180 and is seeded settled (never overdue)", () => {
  const c = contact("c1", { firstSeenAt: minAgo(40), firstRespondedAt: minAgo(37) });
  const lead = contactToInboundLead(c, nowMs);
  assert.equal(lead.respondedSec, 180);
  const seeded = seedResponded([lead]);
  assert.equal(seeded.get("c1"), 180);
  // 40 minutes in, far past the 15-min target — yet a settled row is never overdue.
  const arrivalMs = nowMs - lead.minutesAgo * 60_000;
  assert.equal(isLeadOverdue(lead, nowMs, arrivalMs, seeded), false);
  assert.equal(isLeadOverdue(lead, nowMs, arrivalMs, new Map()), true, "the same row unsettled IS overdue");
});

test("inboxLeadsFromContacts keeps the urgent queue: open rows in deadline order, terminal and tombstoned out", () => {
  const breached = contact("c1", { firstSeenAt: minAgo(30) });
  const ontrack = contact("c2", { firstSeenAt: minAgo(2) });
  const lost = contact("c3", { firstSeenAt: minAgo(40), stage: "lost", lostReason: "price" });
  const erased = contact("c4", { firstSeenAt: minAgo(50), erasedAt: minAgo(1) });
  const leads = inboxLeadsFromContacts([ontrack, lost, erased, breached], nowMs);
  assert.deepEqual(leads.map((l) => l.id), ["c1", "c2"]);
  const many = Array.from({ length: URGENT_QUEUE_CAP + 5 }, (_, i) => contact(`m${i}`, { firstSeenAt: minAgo(i) }));
  assert.equal(inboxLeadsFromContacts(many, nowMs).length, URGENT_QUEUE_CAP);
});

test("qualifyPatch moves an open contact to qualified, never regresses a later stage", () => {
  assert.deepEqual(qualifyPatch(HOT, { stage: "new" }), { stage: "qualified", qualification: HOT, firstRespondedAt: true });
  const won = qualifyPatch(HOT, { stage: "won" });
  assert.equal("stage" in won, false, "a qualify never moves a won contact back");
  assert.deepEqual(won, { qualification: HOT, firstRespondedAt: true });
});

test("sanitizeQualification clamps each field to its union and refuses a non-object", () => {
  assert.deepEqual(sanitizeQualification({ timeline: "asap", budget: "bogus" }), {
    timeline: "asap",
    budget: "unknown",
    scope: "unknown",
    disposition: "unknown",
  });
  assert.equal(sanitizeQualification("x"), null);
  assert.equal(sanitizeQualification(null), null);
  assert.equal(sanitizeQualification([]), null);
});

/* ── the PII rule: no live CRM contact reaches the LLM chokepoint ───────────── */

test("twin-reply request: a live CRM contact builds NONE, a sample lead keeps its AI draft", () => {
  const ctx = { serviceHints: ["Revize"], locale: "cs", brand: "Firma" };
  const live = contactToInboundLead(
    contact("c1", { name: "Jan Novák", email: "jan@firma.cz", phone: "+420777000111", notes: "Revize prosím" }),
    nowMs
  );
  assert.equal(twinReplyRequestFor(live, ctx), null, "no request object exists for a lead with a contactId");

  const sample = SAMPLE_LEADS[0];
  const req = twinReplyRequestFor(sample, ctx);
  assert.ok(req, "a sample lead still drafts with the model");
  assert.equal(req.inbound, sample.message);
  assert.equal(req.channel, "leads");
  assert.equal(req.arrival, sample.channel);
  assert.equal(req.contact, sample.name);
  assert.equal(req.brand, "Firma");
});

/* ── LOCAL_DB: BANT reaches the grade on both scoring call sites ───────────── */

const event = (projectId, n, over = {}) => ({
  id: `ev-${n}`,
  projectId,
  connectorId: "csv",
  externalId: `row-${n}`,
  kind: "message",
  occurredAt: NOW.toISOString(),
  identity: { email: "jana@firma.cz", name: "Jana Nováková" },
  attribution: { source: "meta-lead-form" },
  text: "Chci nabídku",
  receivedAt: NOW.toISOString(),
  status: "pending",
  ...over,
});

async function contactWithTwoMessages(p) {
  await applyLeadEvent(p, event(p, 1), { now: NOW });
  const second = await applyLeadEvent(p, event(p, 2), { now: NOW });
  return second.contact;
}

test("LOCAL_DB: patchContact stores the qualification and the engagement axis counts it (>= 60)", async () => {
  const p = pid();
  const c = await contactWithTwoMessages(p);
  assert.ok(c.score.engagement <= 50, "precondition: behaviour alone is capped at 50");
  await patchContact(p, c, { qualification: HOT, firstRespondedAt: NOW.toISOString() }, NOW);
  const stored = await getContact(p, c.id);
  assert.deepEqual(stored.qualification, HOT);
  assert.ok(stored.score.engagement >= 60, `engagement ${stored.score.engagement} should reach the grade threshold`);
});

test("LOCAL_DB: a re-enquiry merged into a qualified contact keeps the BANT half (> 50)", async () => {
  const p = pid();
  const c = await contactWithTwoMessages(p);
  await patchContact(p, c, { qualification: HOT, firstRespondedAt: NOW.toISOString() }, NOW);
  const merged = await applyLeadEvent(p, event(p, 3), { now: NOW });
  assert.equal(merged.outcome, "merged");
  assert.deepEqual(merged.contact.qualification, HOT);
  assert.ok(merged.contact.score.engagement > 50, `engagement ${merged.contact.score.engagement} dropped the BANT half`);
});

/* ── the sample↔live seam ────────────────────────────────────────────────────── */

test("resolveInboxLeads on a project with 0 contacts keeps the per-type sample (live:false)", async () => {
  const lead = await resolveInboxLeads({ id: pid(), type: "leadgen" }, NOW);
  assert.deepEqual(lead, { live: false, leads: SAMPLE_LEADS });
  const local = await resolveInboxLeads({ id: pid(), type: "local" }, NOW);
  assert.deepEqual(local, { live: false, leads: LOCAL_SAMPLE_LEADS });
});

test("resolveInboxLeads on a project with contacts serves the live urgent queue", async () => {
  const p = pid();
  await applyLeadEvent(p, event(p, 1, { occurredAt: minAgo(20) }), { now: NOW });
  const r = await resolveInboxLeads({ id: p, type: "leadgen" }, NOW);
  assert.equal(r.live, true);
  assert.equal(r.leads.length, 1);
  assert.ok(r.leads[0].contactId, "every live row points back at its contact");
  assert.equal(r.leads[0].minutesAgo, 20);
});
