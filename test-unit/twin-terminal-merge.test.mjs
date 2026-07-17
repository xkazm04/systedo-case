/** mergeTerminalDrafts: a stored terminal (sent/rejected) draft must win over a stale
 *  posted full-state blob that still marks the same id non-terminal — otherwise a
 *  last-writer-wins /twin save un-sends a delivered draft and corrupts the audit trail. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTerminalDraft, mergeTerminalDrafts } from "@/lib/twin/types";

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
