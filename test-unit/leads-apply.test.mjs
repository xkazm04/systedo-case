/** The ingestion spine end to end over the REAL sqlite tables (`lead_contacts`,
 *  `lead_events`, `lead_activities` — DDL + migration v21 in src/lib/db.ts):
 *  `applyLeadEvent` idempotency, auto-merge on a normalised key, the timeline, the
 *  stage-change activity, GDPR erasure with a tombstone, and the CSV connector's
 *  parse → apply round trip. This is the row-based store's proof that it is NOT the
 *  blob pattern: two writes to the same project touch two different rows. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-leads-apply-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { applyLeadEvent } = await import("@/lib/leads/apply");
const { manualLeadEvent } = await import("@/lib/leads/connectors/manual");
const { parseContactCsv, stageFromCsvCell } = await import("@/lib/leads/connectors/csv");
const { changeStage, patchContact, eraseContact } = await import("@/lib/leads/mutate");
const {
  getContact,
  listContacts,
  countContacts,
  listActivities,
  getLeadEvent,
  clearProjectLeads,
} = await import("@/lib/leads/store");
const { dedupKey, isErased, ACTIVITY_CAP } = await import("@/lib/leads/types");

const NOW = new Date("2026-08-22T10:00:00.000Z");
let seq = 0;
const pid = () => `p-${++seq}`;

const event = (projectId, over = {}) => ({
  id: over.externalId ?? "e1",
  projectId,
  connectorId: "csv",
  externalId: "e1",
  kind: "row",
  occurredAt: NOW.toISOString(),
  identity: { name: "Jan Novák", email: "Jan.Novak@Firma.cz" },
  text: "Poptávka na rekonstrukci střechy.",
  attribution: { source: "google-ads", campaign: "Brand" },
  receivedAt: NOW.toISOString(),
  status: "pending",
  ...over,
});

test("applyLeadEvent creates a contact, its timeline entry and its score", async () => {
  const p = pid();
  const r = await applyLeadEvent(p, event(p), { now: NOW });
  assert.equal(r.outcome, "created");
  assert.equal(r.contact.name, "Jan Novák");
  assert.equal(r.contact.emailKey, "jan.novak@firma.cz", "lowercased; dots kept outside gmail");
  assert.equal(r.contact.stage, "new");
  assert.equal(r.contact.attribution.source, "google-ads");
  assert.ok(r.contact.score, "a contact is scored at creation — deterministic, no LLM");
  assert.equal(typeof r.contact.score.fit, "number");
  assert.equal(typeof r.contact.score.engagement, "number");

  const timeline = await listActivities(p, r.contact.id);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].kind, "inbound_message");
  assert.equal(timeline[0].actor.type, "connector");
  // Default bodyRetention is "snippet" — data minimisation, not "full".
  assert.ok(timeline[0].body.startsWith("Poptávka"));

  assert.equal(await countContacts(p), 1);
});

test("IDEMPOTENT: re-applying the same event is a no-op, not a duplicate person", async () => {
  const p = pid();
  const first = await applyLeadEvent(p, event(p), { now: NOW });
  const again = await applyLeadEvent(p, event(p), { now: new Date(NOW.getTime() + 60_000) });

  assert.equal(again.outcome, "duplicate");
  assert.equal(again.contact.id, first.contact.id);
  assert.equal(await countContacts(p), 1);
  assert.equal((await listActivities(p, first.contact.id)).length, 1, "no second timeline entry");

  const stored = await getLeadEvent(p, dedupKey("csv", "e1"));
  assert.equal(stored.status, "applied");
  assert.equal(stored.contactId, first.contact.id);
});

test("auto-merge: a DIFFERENT event with the same normalised email lands on one contact", async () => {
  const p = pid();
  const a = await applyLeadEvent(p, event(p), { now: NOW });
  // Same person, different casing, gmail-style noise on a non-gmail domain is NOT
  // folded — so use the same address written differently.
  const b = await applyLeadEvent(
    p,
    event(p, { id: "e2", externalId: "e2", identity: { name: "J. Novák", email: "  JAN.NOVAK@firma.CZ " } }),
    { now: NOW }
  );
  assert.equal(b.outcome, "merged");
  assert.equal(b.contact.id, a.contact.id);
  assert.equal(await countContacts(p), 1);
  assert.equal((await listActivities(p, a.contact.id)).length, 2, "both enquiries are on the timeline");
});

test("auto-merge on phone works across formats; a mere name match does NOT merge", async () => {
  const p = pid();
  const a = await applyLeadEvent(
    p,
    event(p, { id: "p1", externalId: "p1", identity: { name: "Petra Dvořáková", phone: "777 123 456" } }),
    { now: NOW }
  );
  const b = await applyLeadEvent(
    p,
    event(p, { id: "p2", externalId: "p2", identity: { name: "P. Dvořáková", phone: "+420777123456" } }),
    { now: NOW }
  );
  assert.equal(b.outcome, "merged");
  assert.equal(b.contact.id, a.contact.id);

  const c = await applyLeadEvent(
    p,
    event(p, { id: "p3", externalId: "p3", identity: { name: "Petra Dvořáková" } }),
    { now: NOW }
  );
  assert.equal(c.outcome, "created", "a shared name is a SUGGESTION, never an auto-merge");
  assert.equal(await countContacts(p), 2);
});

test("an event with no usable identity is REJECTED and recorded, never silently dropped", async () => {
  const p = pid();
  const r = await applyLeadEvent(p, event(p, { id: "x", externalId: "x", identity: {} }), { now: NOW });
  assert.equal(r.outcome, "rejected");
  assert.equal(r.reason, "no-identity");
  assert.equal(await countContacts(p), 0);
  const stored = await getLeadEvent(p, dedupKey("csv", "x"));
  assert.equal(stored.status, "failed");
  assert.equal(stored.error, "no-identity");
});

test("bodyRetention: 'none' stores no body at all", async () => {
  const p = pid();
  const r = await applyLeadEvent(p, event(p), { now: NOW, bodyRetention: "none" });
  const timeline = await listActivities(p, r.contact.id);
  assert.equal(timeline[0].body, undefined);
});

test("changeStage appends the stage_change activity that makes velocity computable", async () => {
  const p = pid();
  const { contact } = await applyLeadEvent(p, event(p), { now: NOW });
  const later = new Date(NOW.getTime() + 3 * 86_400_000);
  const moved = await changeStage(p, contact, { to: "qualified" }, later);

  assert.equal(moved.stage, "qualified");
  assert.equal(moved.stageEnteredAt, later.toISOString());
  const timeline = await listActivities(p, contact.id);
  const change = timeline.find((a) => a.kind === "stage_change");
  assert.ok(change, "a stage move without a stage_change entry makes velocity uncomputable");
  assert.equal(change.refs.from, "new");
  assert.equal(change.refs.to, "qualified");

  // A no-op move writes nothing.
  const same = await changeStage(p, moved, { to: "qualified" }, later);
  assert.equal(same, moved);
  assert.equal((await listActivities(p, contact.id)).filter((a) => a.kind === "stage_change").length, 1);
});

test("a terminal move records the preset loss reason (reasons are counted, not narrated)", async () => {
  const p = pid();
  const { contact } = await applyLeadEvent(p, event(p), { now: NOW });
  const lost = await changeStage(p, contact, { to: "lost", reason: "price", note: "Konkurence levnější" }, NOW);
  assert.equal(lost.stage, "lost");
  assert.equal(lost.lostReason, "price");
  assert.equal(lost.lostNote, "Konkurence levnější");
});

test("patchContact re-derives the dedup keys so a key can never drift from its payload", async () => {
  const p = pid();
  const { contact } = await applyLeadEvent(p, event(p), { now: NOW });
  const patched = await patchContact(p, contact, { email: "Nova.Adresa@Gmail.com", tags: ["vip", "vip", "  "] }, NOW);
  assert.equal(patched.email, "Nova.Adresa@Gmail.com");
  assert.equal(patched.emailKey, "novaadresa@gmail.com");
  assert.deepEqual(patched.tags, ["vip"]);
  // The record found by the NEW key is the same contact.
  const found = await listContacts(p, { search: "novaadresa" });
  assert.equal(found.length, 1);
  assert.equal(found[0].id, contact.id);
});

test("GDPR erase leaves a TOMBSTONE: PII and timeline gone, funnel skeleton kept", async () => {
  const p = pid();
  const { contact } = await applyLeadEvent(p, event(p), { now: NOW });
  await changeStage(p, contact, { to: "qualified" }, NOW);
  const current = await getContact(p, contact.id);

  const tomb = await eraseContact(p, current, "žádost subjektu údajů", NOW);
  assert.ok(isErased(tomb));
  assert.equal(tomb.name, undefined);
  assert.equal(tomb.email, undefined);
  assert.equal(tomb.phone, undefined);
  assert.equal(tomb.emailKey, undefined);
  assert.equal(tomb.notes, undefined);
  // …but the anonymous statistics survive, so Kvalita leadů does not silently change.
  assert.equal(tomb.stage, "qualified");
  assert.equal(tomb.attribution.source, "google-ads");
  assert.equal(tomb.firstSeenAt, contact.firstSeenAt);

  assert.equal((await listActivities(p, contact.id)).length, 0, "message bodies must be gone");
  // A tombstone is not a person: it is hidden from the default list.
  assert.equal((await listContacts(p, {})).length, 0);
  assert.equal((await listContacts(p, { includeErased: true })).length, 1);
});

test("list filters: stage is pushed into the query, search is diacritic-folded", async () => {
  const p = pid();
  await applyLeadEvent(p, event(p, { id: "s1", externalId: "s1", identity: { name: "Žofie Křížová", email: "zofie@firma.cz" } }), { now: NOW });
  const b = await applyLeadEvent(p, event(p, { id: "s2", externalId: "s2", identity: { name: "Tomáš Beneš", email: "tomas@jina.cz" } }), { now: NOW });
  await changeStage(p, b.contact, { to: "won" }, NOW);

  assert.equal((await listContacts(p, {})).length, 2);
  assert.equal((await listContacts(p, { stage: "won" })).length, 1);
  assert.equal((await listContacts(p, { search: "krizova" })).length, 1, "a Czech operator types without diacritics");
  assert.equal((await listContacts(p, { search: "ZOFIE" })).length, 1);
  assert.equal((await listContacts(p, { search: "nikdo" })).length, 0);
});

test("the timeline is capped per contact (oldest evicted), not unbounded", async () => {
  const p = pid();
  const first = await applyLeadEvent(p, event(p, { id: "cap0", externalId: "cap0" }), { now: NOW });
  const { appendActivity } = await import("@/lib/leads/store");
  for (let i = 0; i < ACTIVITY_CAP + 5; i++) {
    await appendActivity(p, first.contact.id, {
      id: `cap-${String(i).padStart(4, "0")}`,
      at: new Date(NOW.getTime() + i * 1000).toISOString(),
      kind: "note",
      actor: { type: "system" },
      summary: `n${i}`,
    });
  }
  const timeline = await listActivities(p, first.contact.id, 10_000);
  assert.equal(timeline.length, ACTIVITY_CAP);
  assert.equal(timeline[0].id, `cap-${String(ACTIVITY_CAP + 4).padStart(4, "0")}`, "newest first");
});

test("CSV connector: parse → apply, and a re-import under the same importId is a no-op", async () => {
  const p = pid();
  const csv = [
    "jméno;e-mail;telefon;firma;zdroj;fáze;datum;poznámka",
    "Jan Novák;jan@stavbyprofi.cz;777 123 456;Stavby Profi;google-ads;kvalifikovaný;12.8.2026;Střecha 180 m2",
    'Petra Dvořáková;p.dvorakova@gmail.com;;;referral;uzavřeno;2026-08-01;"Doporučení; volat odpoledne"',
    ";;;;;;;prázdný řádek bez identity",
  ].join("\n");

  const parsed = parseContactCsv(csv, { projectId: p, importId: "imp-1", receivedAt: NOW.toISOString() });
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.skipped, 1, "a row with no identity is dropped and REPORTED");
  assert.equal(parsed.events[0].identity.email, "jan@stavbyprofi.cz");
  assert.equal(parsed.events[0].externalId, "imp-1:0");
  assert.equal(parsed.events[0].occurredAt.slice(0, 10), "2026-08-12", "Czech D.M.YYYY parses");
  assert.equal(stageFromCsvCell("kvalifikovaný"), "qualified");
  assert.equal(stageFromCsvCell("uzavřeno"), "won");
  assert.equal(stageFromCsvCell("ztraceno"), "lost");

  for (const e of parsed.events) {
    await applyLeadEvent(p, e, { now: NOW, initialStage: stageFromCsvCell(e.raw?.stage) ?? "new" });
  }
  assert.equal(await countContacts(p), 2);
  const won = await listContacts(p, { stage: "won" });
  assert.equal(won.length, 1);
  assert.equal(won[0].name, "Petra Dvořáková");

  // Re-import of the same file under the same id: zero new contacts.
  const again = parseContactCsv(csv, { projectId: p, importId: "imp-1", receivedAt: NOW.toISOString() });
  let duplicates = 0;
  for (const e of again.events) {
    const r = await applyLeadEvent(p, e, { now: NOW });
    if (r.outcome === "duplicate") duplicates += 1;
  }
  assert.equal(duplicates, 2);
  assert.equal(await countContacts(p), 2);
});

test("manual connector walks the same pipeline (dedup included)", async () => {
  const p = pid();
  const ev = manualLeadEvent(p, "sub-1", { name: "Eva Marková", phone: "602 118 447", note: "Objednání" }, NOW);
  const a = await applyLeadEvent(p, ev, { now: NOW });
  assert.equal(a.outcome, "created");
  assert.equal(a.contact.phoneKey, "+420602118447");
  const b = await applyLeadEvent(p, manualLeadEvent(p, "sub-1", { name: "Eva Marková", phone: "602 118 447" }, NOW), { now: NOW });
  assert.equal(b.outcome, "duplicate", "a double-clicked submit must not create two people");
});

test("SLA clock is set only when the project declares a response target", async () => {
  const p = pid();
  const none = await applyLeadEvent(p, event(p, { id: "sla0", externalId: "sla0" }), { now: NOW });
  assert.equal(none.contact.slaDueAt, undefined, "an absent deadline is honest; an invented one is not");

  const p2 = pid();
  const withTarget = await applyLeadEvent(p2, event(p2, { id: "sla1", externalId: "sla1" }), {
    now: NOW,
    responseTargetMinutes: 15,
  });
  assert.equal(withTarget.contact.slaDueAt, new Date(NOW.getTime() + 15 * 60_000).toISOString());
});

test("clearProjectLeads wipes contacts, events and timelines for that project only", async () => {
  const a = pid();
  const b = pid();
  await applyLeadEvent(a, event(a), { now: NOW });
  await applyLeadEvent(b, event(b), { now: NOW });
  await clearProjectLeads(a);
  assert.equal(await countContacts(a), 0);
  assert.equal(await countContacts(b), 1, "row-based storage is per project — no cross-tenant blast radius");
});
