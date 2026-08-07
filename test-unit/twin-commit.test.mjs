/** Slice commits ("commit the slice, not the blob"): the /twin POST body carries
 *  only the sections an interaction changed, merged server-side inside the atomic
 *  mutate. These pin the merge semantics (replace / append / upsert / absent-key
 *  no-touch), that both draft-lifecycle invariants survive the upsert path, and the
 *  measured payload drop that motivated the direction. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTwinCommit,
  MAX_FACTS,
  sanitizeTwinCommit,
  sanitizeTwinState,
} from "@/lib/twin/types";

const voice = (scope, directives = "Piš věcně.") => ({
  scope,
  directives,
  traits: [],
  lengthHint: "",
  constraints: [],
  examples: [],
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const chan = (channel, over = {}) => ({
  channel,
  enabled: true,
  autonomy: "assist",
  connector: "manual",
  autoThreshold: 80,
  ...over,
});

const fact = (id, over = {}) => ({
  id,
  scope: "generic",
  question: "",
  answer: `answer ${id}`,
  source: "sample",
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

const draft = (id, status = "pending", over = {}) => ({
  id,
  channel: "email",
  contact: "Jana",
  inbound: "Dotaz",
  reply: `reply ${id}`,
  questions: [],
  confidence: 90,
  risks: [],
  status,
  autoApproved: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

const stored = () => ({
  voices: [voice("generic"), voice("email")],
  channels: [chan("email"), chan("leads")],
  facts: [fact("f1"), fact("f2")],
  drafts: [draft("d1", "pending"), draft("d2", "sent"), draft("d3", "rejected")],
});

// --- sanitizeTwinCommit ------------------------------------------------------

test("sanitizeTwinCommit: only PRESENT keys survive — absent means don't-touch", () => {
  const s = sanitizeTwinCommit({ drafts: [{ channel: "email", reply: "x" }] });
  assert.deepEqual(Object.keys(s), ["drafts"], "no phantom sections appear");
  assert.equal(s.drafts.length, 1);

  const empty = sanitizeTwinCommit({ facts: [] });
  assert.deepEqual(empty.facts, [], "a present-but-empty section is a deliberate clear");
  assert.equal("drafts" in empty, false);

  assert.deepEqual(sanitizeTwinCommit(null), {}, "a null body touches nothing");
});

test("sanitizeTwinCommit: each section runs the same sanitizer as the full-state path", () => {
  const junk = {
    voices: [{ scope: "email", directives: "a" }, { scope: "nonsense" }],
    channels: [{ channel: "pigeon", enabled: true }, { channel: "email", autonomy: "sudo", autoThreshold: 9000 }],
    addFacts: [{ answer: "ok" }, { answer: "" }],
    drafts: [{ channel: "email", reply: "x", status: "definitely-sent" }, { channel: "email" }],
  };
  const s = sanitizeTwinCommit(junk);
  assert.equal(s.voices.length, 1, "unknown scope dropped");
  assert.equal(s.channels.length, 1, "unknown channel dropped");
  assert.equal(s.channels[0].autonomy, "assist", "unknown autonomy degrades");
  assert.equal(s.addFacts.length, 1, "answerless fact dropped");
  assert.equal(s.drafts.length, 1, "replyless draft dropped");
  assert.equal(s.drafts[0].status, "pending", "unknown status degrades");
});

test("sanitizeTwinCommit: a legacy full-state blob is a valid every-key slice", () => {
  const legacy = stored();
  const s = sanitizeTwinCommit(legacy);
  assert.deepEqual(s, sanitizeTwinState(legacy), "same sections, same sanitization");
});

// --- applyTwinCommit ---------------------------------------------------------

test("applyTwinCommit: absent keys keep the stored sections untouched", () => {
  const prev = stored();
  const next = applyTwinCommit(prev, {});
  assert.deepEqual(next, prev, "an empty slice is a no-op merge");
});

test("applyTwinCommit: voices/channels/facts REPLACE their whole section", () => {
  const prev = stored();
  const next = applyTwinCommit(prev, {
    voices: [voice("chat")],
    channels: [chan("chat")],
    facts: [fact("f9")],
  });
  assert.deepEqual(next.voices.map((v) => v.scope), ["chat"]);
  assert.deepEqual(next.channels.map((c) => c.channel), ["chat"]);
  assert.deepEqual(next.facts.map((f) => f.id), ["f9"]);
  assert.equal(next.drafts, prev.drafts, "the untouched outbox rides through by reference");
});

test("applyTwinCommit: addFacts APPENDS, capped to the NEWEST MAX_FACTS", () => {
  const prev = { ...stored(), facts: Array.from({ length: MAX_FACTS }, (_, i) => fact(`old${i}`)) };
  const next = applyTwinCommit(prev, { addFacts: [fact("fresh")] });
  assert.equal(next.facts.length, MAX_FACTS, "the cap holds");
  assert.equal(next.facts.at(-1).id, "fresh", "the appended fact survives");
  assert.equal(next.facts[0].id, "old1", "the OLDEST fact is the one dropped");
});

test("applyTwinCommit: drafts UPSERT — append new ids, replace matching ids, never delete", () => {
  const prev = stored();
  const flipped = draft("d1", "approved");
  const fresh = draft("d9", "pending");
  const next = applyTwinCommit(prev, { drafts: [flipped, fresh] });
  assert.deepEqual(next.drafts.map((d) => d.id), ["d1", "d2", "d3", "d9"], "stored-only drafts survive");
  assert.equal(next.drafts.find((d) => d.id === "d1").status, "approved", "matching id replaced in place");
});

test("applyTwinCommit: a stored terminal record is frozen against an upsert", () => {
  const prev = stored(); // d2 sent, d3 rejected
  const next = applyTwinCommit(prev, {
    drafts: [draft("d2", "approved", { reply: "rewrite attempt" }), draft("d3", "pending")],
  });
  assert.equal(next.drafts.find((d) => d.id === "d2").status, "sent", "the send is not un-set");
  assert.equal(next.drafts.find((d) => d.id === "d2").reply, "reply d2", "the frozen text survives");
  assert.equal(next.drafts.find((d) => d.id === "d3").status, "rejected", "the rejection is not un-set");
});

test("applyTwinCommit: a client-minted `sent` upsert demotes to approved (sent means sent)", () => {
  const prev = stored();
  const forged = draft("d9", "sent", { sentAt: "2026-07-02T00:00:00.000Z" });
  const next = applyTwinCommit(prev, { drafts: [forged] });
  const out = next.drafts.find((d) => d.id === "d9");
  assert.equal(out.status, "approved", "the strongest client-assertable status");
  assert.equal("sentAt" in out, false, "the forged stamp is stripped");
});

test("applyTwinCommit: null prev — the slice becomes the state (first save)", () => {
  const next = applyTwinCommit(null, { voices: [voice("generic")], drafts: [draft("d1")] });
  assert.deepEqual(next.voices.map((v) => v.scope), ["generic"]);
  assert.deepEqual(next.drafts.map((d) => d.id), ["d1"]);
  assert.deepEqual(next.channels, []);
  assert.deepEqual(next.facts, []);
});

// --- the measured payload drop ----------------------------------------------

test("an approve slice is a fraction of the full-blob POST it replaces", () => {
  // A realistic worst-case hot blob: 200 drafts with 4000-char replies, a trained
  // voice per scope, a full fact corpus.
  const bigState = {
    voices: ["generic", "email", "leads", "chat"].map((s) => voice(s, "x".repeat(2000))),
    channels: [chan("email"), chan("leads"), chan("chat")],
    facts: Array.from({ length: MAX_FACTS }, (_, i) => fact(`f${i}`, { answer: "y".repeat(500) })),
    drafts: Array.from({ length: 200 }, (_, i) =>
      draft(`d${i}`, "pending", { reply: "z".repeat(4000), inbound: "w".repeat(1000) })
    ),
  };
  const approvedOne = draft("d0", "approved", { reply: "z".repeat(4000), inbound: "w".repeat(1000) });

  const fullBytes = JSON.stringify(bigState).length; // what every interaction used to POST
  const sliceBytes = JSON.stringify({ drafts: [approvedOne] }).length; // what an approve POSTs now

  assert.ok(fullBytes > 1_000_000, `the blob really is megabyte-class (${fullBytes} B)`);
  assert.ok(
    sliceBytes < fullBytes / 100,
    `the approve slice must be <1% of the blob (full=${fullBytes} B, slice=${sliceBytes} B)`
  );
});
