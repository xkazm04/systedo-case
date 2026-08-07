/** The draft-lifecycle guards the /twin POST route runs inside its atomic mutate:
 *   - mergeTerminalDrafts: a stored terminal (sent/rejected) draft is a FROZEN audit
 *     record and wins over whatever a posted blob claims for the same id — otherwise
 *     a last-writer-wins save un-sends a delivered draft or rewrites a frozen record.
 *   - enforceServerSent ("sent means sent"): the approved→sent transition belongs to
 *     send/route.ts's atomic claim alone; a client-posted NEW `sent` demotes to
 *     `approved`. Together they make the types.ts invariant "send/route.ts is the
 *     sole writer of sent/sentAt" TRUE, not aspirational. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceServerSent, isTerminalDraft, mergeTerminalDrafts } from "@/lib/twin/types";

const draft = (id, status) => ({
  id,
  channel: "email",
  contact: "",
  inbound: "hi",
  reply: "reply",
  questions: [],
  confidence: 90,
  risks: [],
  status,
  autoApproved: false,
  createdAt: "2026-07-16T00:00:00.000Z",
});

test("isTerminalDraft: sent/rejected are terminal, others are not", () => {
  assert.equal(isTerminalDraft({ status: "sent" }), true);
  assert.equal(isTerminalDraft({ status: "rejected" }), true);
  assert.equal(isTerminalDraft({ status: "approved" }), false);
  assert.equal(isTerminalDraft({ status: "pending" }), false);
});

test("mergeTerminalDrafts: a stored `sent` wins over a stale posted `approved`", () => {
  const stored = [draft("a", "sent")];
  const posted = [draft("a", "approved")]; // stale client copy
  const merged = mergeTerminalDrafts(stored, posted);
  assert.equal(merged[0].status, "sent", "the send is not un-set");
});

test("mergeTerminalDrafts: a stored `rejected` wins over a posted `approved`", () => {
  const merged = mergeTerminalDrafts([draft("a", "rejected")], [draft("a", "approved")]);
  assert.equal(merged[0].status, "rejected");
});

test("mergeTerminalDrafts: a legitimate non-terminal update is preserved", () => {
  // stored pending, posted approved (a real human approval) — the posted status wins.
  const merged = mergeTerminalDrafts([draft("a", "pending")], [draft("a", "approved")]);
  assert.equal(merged[0].status, "approved");
});

test("mergeTerminalDrafts: never resurrects a terminal draft the client dropped; only merges by id", () => {
  const merged = mergeTerminalDrafts([draft("a", "sent")], [draft("b", "approved")]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "b");
  assert.equal(merged[0].status, "approved");
});

test("mergeTerminalDrafts: empty/absent stored returns the posted list unchanged", () => {
  const posted = [draft("a", "approved")];
  assert.equal(mergeTerminalDrafts(null, posted), posted);
  assert.equal(mergeTerminalDrafts([], posted), posted);
});

test("mergeTerminalDrafts: a stored terminal record is frozen even against a posted TERMINAL copy", () => {
  // A client posting the record still-`sent` but with a rewritten reply/stamp must
  // not alter the frozen audit record — the stored copy wins wholesale.
  const stored = { ...draft("a", "sent"), reply: "what actually went out", sentAt: "2026-07-16T01:00:00.000Z" };
  const posted = { ...draft("a", "sent"), reply: "revisionist copy", sentAt: "2026-07-16T09:99:99.000Z" };
  const merged = mergeTerminalDrafts([stored], [posted]);
  assert.equal(merged[0].reply, "what actually went out", "the frozen record's text survives");
  assert.equal(merged[0].sentAt, "2026-07-16T01:00:00.000Z", "the frozen record's stamp survives");
});

// --- enforceServerSent: "sent means sent" ----------------------------------

test("enforceServerSent: a client-posted NEW `sent` demotes to approved, sentAt stripped", () => {
  const posted = { ...draft("a", "sent"), sentAt: "2026-07-16T00:00:00.000Z", autoApproved: true };
  const [out] = enforceServerSent([], [posted]);
  assert.equal(out.status, "approved", "the strongest status a client may assert");
  assert.equal("sentAt" in out, false, "the forged send stamp is stripped");
  assert.equal(out.autoApproved, false, "no machine-approval claim rides along");
  // Absent stored state behaves the same as empty.
  assert.equal(enforceServerSent(null, [posted])[0].status, "approved");
  assert.equal(enforceServerSent(undefined, [posted])[0].status, "approved");
});

test("enforceServerSent: a store-corroborated `sent` passes through untouched", () => {
  const stored = [draft("a", "sent")];
  const posted = [{ ...draft("a", "sent"), sentAt: "2026-07-16T00:00:00.000Z" }];
  const [out] = enforceServerSent(stored, posted);
  assert.equal(out.status, "sent", "the claim path already minted this send");
  assert.equal(out, posted[0], "left for mergeTerminalDrafts to resolve (stored wins there)");
});

test("enforceServerSent: rejected and live statuses are none of its business", () => {
  const posted = [draft("a", "rejected"), draft("b", "approved"), draft("c", "pending")];
  assert.deepEqual(
    enforceServerSent([], posted).map((d) => d.status),
    ["rejected", "approved", "pending"],
    "a human rejection is a legitimate client-side decision; live work is untouched"
  );
});

test("enforceServerSent + mergeTerminalDrafts: the route pipeline mints no phantom send", () => {
  // What the POST route runs inside its atomic mutate, in order.
  const stored = [draft("real", "sent")];
  const posted = [
    { ...draft("real", "approved") }, // stale copy of a genuinely sent draft
    { ...draft("forged", "sent"), sentAt: "2026-07-16T00:00:00.000Z" }, // client-minted send
  ];
  const out = mergeTerminalDrafts(stored, enforceServerSent(stored, posted));
  assert.equal(out.find((d) => d.id === "real").status, "sent", "the true send survives the stale copy");
  assert.equal(out.find((d) => d.id === "forged").status, "approved", "the forged send never lands");
});
