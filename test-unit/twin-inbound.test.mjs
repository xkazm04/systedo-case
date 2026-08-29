/** WP W3-D — the twin INTAKE's pure half (src/lib/twin/inbound.ts): the three wire
 *  shapes, the text hygiene, the idempotency key, the pending cap's eviction rule, and
 *  the two credential rituals (Meta's verify token, both signature flavours).
 *
 *  Everything here is offline by construction — the module does no I/O. The route's own
 *  guarantees (raw-before-parse, the row-supplied tenant) are asserted through these
 *  functions plus the store suite; what cannot be asserted without a live platform is
 *  listed in the WP report. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  INBOUND_ID_PREFIX,
  INBOUND_PENDING_CAP,
  INBOUND_TEXT_MAX,
  applyInboundMessages,
  applyInboundToState,
  buildInboundDraft,
  inboundDraftId,
  inboundFlavour,
  isInboundDraft,
  metaSignatureHeader,
  metaVerifyToken,
  normalizeInbound,
  safeEqual,
  stripInboundText,
  verifyMetaSignature,
} from "@/lib/twin/inbound";
import { decideDraft, sanitizeTwinState, TWIN_CHANNELS } from "@/lib/twin/types";
import { signatureHeader, verifyOutboundSignature } from "@/lib/outbound/types";

const SECRET = "unit-test-intake-secret-please-ignore";
const NOW = "2026-08-30T09:00:00.000Z";

// ── flavour routing ───────────────────────────────────────────────────────────

test("the endpoint's CHANNEL picks the dialect — never anything on the wire", () => {
  assert.equal(inboundFlavour("social"), "meta");
  assert.equal(inboundFlavour("reviews"), "gbp");
  // Every other channel takes the generic mail-forwarder shape.
  for (const c of TWIN_CHANNELS) {
    if (c === "social" || c === "reviews") continue;
    assert.equal(inboundFlavour(c), "email", `${c} should take the generic shape`);
  }
});

test("an unknown channel normalizes to nothing (never throws, never guesses)", () => {
  assert.deepEqual(normalizeInbound("not-a-channel", { from: "a@b.cz", text: "x" }), []);
});

// ── meta ──────────────────────────────────────────────────────────────────────

const META_PAYLOAD = {
  object: "page",
  entry: [
    {
      id: "page_1",
      messaging: [{ sender: { id: "u_9", name: "Jana N." }, message: { mid: "m_abc", text: "Kolik stojí ta směs?" } }],
      changes: [
        {
          field: "feed",
          value: { comment_id: "c_77", from: { id: "u_3", name: "Petr Svoboda" }, message: "Máte to skladem?" },
        },
      ],
    },
  ],
};

test("meta: entry[].messaging + entry[].changes both normalize, ids and names mapped", () => {
  const msgs = normalizeInbound("social", META_PAYLOAD);
  assert.equal(msgs.length, 2);
  assert.deepEqual(msgs[0], {
    externalId: "m_abc",
    contact: { name: "Jana N.", handle: "u_9" },
    inbound: "Kolik stojí ta směs?",
    channel: "social",
  });
  assert.deepEqual(msgs[1], {
    externalId: "c_77",
    contact: { name: "Petr Svoboda", handle: "u_3" },
    inbound: "Máte to skladem?",
    channel: "social",
  });
});

test("meta: an empty-bodied message is dropped, not stored as a blank draft", () => {
  const msgs = normalizeInbound("social", {
    entry: [{ messaging: [{ sender: { id: "u_1" }, message: { mid: "m_1", text: "   " } }] }],
  });
  assert.deepEqual(msgs, []);
});

// ── email ─────────────────────────────────────────────────────────────────────

test("email: { from, subject, text } → one message, subject folded into the body", () => {
  const msgs = normalizeInbound("email", {
    messageId: "<abc@mail>",
    from: "jana@example.cz",
    fromName: "Jana N.",
    subject: "Poptávka",
    text: "Dobrý den, máte volno v pátek?",
  });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].externalId, "<abc@mail>");
  assert.deepEqual(msgs[0].contact, { name: "Jana N.", handle: "jana@example.cz" });
  assert.equal(msgs[0].inbound, "Poptávka\n\nDobrý den, máte volno v pátek?");
  assert.equal(msgs[0].channel, "email");
});

test("email: a `messages` array normalizes each item", () => {
  const msgs = normalizeInbound("chat", {
    messages: [
      { id: "1", from: "a@b.cz", text: "první" },
      { id: "2", from: "c@d.cz", text: "druhá" },
    ],
  });
  assert.deepEqual(
    msgs.map((m) => [m.externalId, m.inbound, m.channel]),
    [
      ["1", "první", "chat"],
      ["2", "druhá", "chat"],
    ]
  );
});

// ── gbp ───────────────────────────────────────────────────────────────────────

test("gbp: a review carries its star rating INTO the body an operator answers", () => {
  const msgs = normalizeInbound("reviews", {
    reviews: [{ reviewId: "r_1", reviewer: { displayName: "Tomáš D." }, starRating: "TWO", comment: "Dlouhé čekání." }],
  });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].externalId, "r_1");
  assert.deepEqual(msgs[0].contact, { name: "Tomáš D." });
  assert.equal(msgs[0].inbound, "★ TWO\n\nDlouhé čekání.");
  assert.equal(msgs[0].channel, "reviews");
});

test("gbp: questions normalize alongside reviews", () => {
  const msgs = normalizeInbound("reviews", {
    questions: [{ questionId: "q_1", author: { displayName: "Ivana" }, text: "Máte bezbariérový vstup?" }],
  });
  assert.deepEqual(
    msgs.map((m) => [m.externalId, m.inbound]),
    [["q_1", "Máte bezbariérový vstup?"]]
  );
});

// ── text hygiene ──────────────────────────────────────────────────────────────

test("HTML is stripped, script bodies go whole, entities are NOT decoded", () => {
  assert.equal(stripInboundText("<b>Ahoj</b> <i>světe</i>"), "Ahoj světe");
  assert.equal(stripInboundText("před<script>alert(1)</script>po"), "před po");
  // Decoding after stripping would be a way to re-introduce the '<' we just removed.
  assert.equal(stripInboundText("&lt;script&gt;"), "&lt;script&gt;");
});

test("the body is clamped at INBOUND_TEXT_MAX, once, after joining", () => {
  const long = "a".repeat(INBOUND_TEXT_MAX + 500);
  const msgs = normalizeInbound("email", { from: "a@b.cz", subject: "s", text: long });
  assert.equal(msgs[0].inbound.length, INBOUND_TEXT_MAX);
});

test("a non-string body is empty, never a coerced 'undefined'", () => {
  assert.equal(stripInboundText(undefined), "");
  assert.equal(stripInboundText(42), "");
});

// ── identity + idempotency ────────────────────────────────────────────────────

test("the draft id is derived from the platform's externalId when there is one", () => {
  const msg = { externalId: "m_abc", contact: {}, inbound: "x", channel: "social" };
  const a = inboundDraftId(msg, "raw-one");
  const b = inboundDraftId(msg, "completely-different-raw");
  assert.equal(a, b, "a re-delivery with a different envelope is still the same message");
  assert.ok(a.startsWith(INBOUND_ID_PREFIX));
  assert.equal(a.length, INBOUND_ID_PREFIX.length + 16);
});

test("with no externalId the id still separates DIFFERENT messages in one batch", () => {
  const raw = JSON.stringify(META_PAYLOAD);
  const one = { contact: { handle: "u_1" }, inbound: "první", channel: "email" };
  const two = { contact: { handle: "u_1" }, inbound: "druhá", channel: "email" };
  assert.notEqual(inboundDraftId(one, raw), inboundDraftId(two, raw));
  // …and re-delivering the exact same bytes is idempotent.
  assert.equal(inboundDraftId(one, raw), inboundDraftId({ ...one }, raw));
});

test("ACCEPTANCE — a batch of 2 with 1 already stored mints exactly 1, reporting 1 duplicate", () => {
  const raw = JSON.stringify(META_PAYLOAD);
  const msgs = normalizeInbound("social", META_PAYLOAD);
  const first = applyInboundMessages([], msgs, raw, NOW);
  assert.equal(first.accepted, 2);
  assert.equal(first.duplicates, 0);

  // The page re-delivers, this time with one extra message.
  const extra = { externalId: "m_new", contact: { name: "Nový" }, inbound: "ahoj", channel: "social" };
  const second = applyInboundMessages(first.drafts, [msgs[0], extra], raw, NOW);
  assert.equal(second.accepted, 1);
  assert.equal(second.duplicates, 1);
  assert.equal(second.drafts.length, 3);
});

test("a replayed identical payload mints NOTHING (the Meta flavour's replay defence)", () => {
  const raw = JSON.stringify(META_PAYLOAD);
  const msgs = normalizeInbound("social", META_PAYLOAD);
  const once = applyInboundMessages([], msgs, raw, NOW);
  const twice = applyInboundMessages(once.drafts, msgs, raw, NOW);
  assert.equal(twice.accepted, 0);
  assert.equal(twice.duplicates, 2);
  assert.equal(twice.drafts.length, once.drafts.length);
});

// ── the draft an inbound message becomes ──────────────────────────────────────

test("an inbound draft is pending, unapproved, risk-flagged, and carries NO sentAt", () => {
  const d = buildInboundDraft(
    { externalId: "m_1", contact: { name: "Jana" }, inbound: "ahoj", channel: "social" },
    "in_deadbeefdeadbeef",
    NOW
  );
  assert.equal(d.status, "pending");
  assert.equal(d.autoApproved, false);
  assert.equal(d.reply, "");
  assert.equal(d.confidence, 0);
  assert.deepEqual(d.risks, ["inbound"]);
  assert.equal(d.contact, "Jana");
  assert.equal("sentAt" in d, false, "the intake must never mint a send stamp");
  assert.ok(isInboundDraft(d));
});

test("even an `auto` channel cannot auto-approve an arriving message (the risk flag holds)", () => {
  const d = buildInboundDraft({ contact: {}, inbound: "ahoj", channel: "social" }, "in_x", NOW);
  const cfg = { channel: "social", enabled: true, autonomy: "auto", connector: "manual", autoThreshold: 0 };
  assert.deepEqual(decideDraft(cfg, d), { status: "pending", autoApproved: false });
});

test("an inbound draft SURVIVES the sanitizer that both the wire and the READ path run", () => {
  const draft = buildInboundDraft(
    { externalId: "m_1", contact: { name: "Jana" }, inbound: "opravdová zpráva", channel: "social" },
    "in_deadbeefdeadbeef",
    NOW
  );
  const s = sanitizeTwinState({ drafts: [draft] });
  assert.equal(s.drafts.length, 1, "a replyless-but-inbound record is content, not an empty shell");
  assert.equal(s.drafts[0].inbound, "opravdová zpráva");
  assert.equal(s.drafts[0].reply, "");
  assert.equal(s.drafts[0].id, "in_deadbeefdeadbeef");
});

test("a record with NEITHER side filled is still dropped (the old rule's purpose holds)", () => {
  assert.equal(sanitizeTwinState({ drafts: [{ channel: "social" }] }).drafts.length, 0);
  assert.equal(sanitizeTwinState({ drafts: [{ channel: "social", reply: "", inbound: "  " }] }).drafts.length, 0);
});

// ── the cap ───────────────────────────────────────────────────────────────────

const inboundDraft = (i) => ({
  id: `${INBOUND_ID_PREFIX}${String(i).padStart(16, "0")}`,
  channel: "social",
  contact: "",
  inbound: `m${i}`,
  reply: "",
  questions: [],
  confidence: 0,
  risks: ["inbound"],
  status: "pending",
  autoApproved: false,
  // Well before NOW, so the freshly-arrived message is never the oldest.
  createdAt: new Date(Date.parse("2026-01-01T00:00:00.000Z") + i * 1000).toISOString(),
});

test("the cap evicts the OLDEST inbound-pending drafts and nothing else", () => {
  const stored = Array.from({ length: INBOUND_PENDING_CAP }, (_, i) => inboundDraft(i));
  const raw = "r";
  const fresh = [{ externalId: "brand-new", contact: {}, inbound: "nová", channel: "social" }];
  const res = applyInboundMessages(stored, fresh, raw, NOW);
  assert.equal(res.accepted, 1);
  assert.equal(res.evicted, 1);
  assert.equal(res.drafts.length, INBOUND_PENDING_CAP);
  assert.equal(res.drafts.some((d) => d.id === stored[0].id), false, "the oldest went");
  assert.ok(res.drafts.some((d) => d.inbound === "nová"));
});

test("the cap NEVER evicts an operator-written draft, however full the inbox is", () => {
  const human = {
    ...inboundDraft(0),
    id: "d_human",
    createdAt: "2000-01-01T00:00:00.000Z", // by far the oldest
    reply: "napsal člověk",
  };
  const stored = [human, ...Array.from({ length: INBOUND_PENDING_CAP }, (_, i) => inboundDraft(i + 1))];
  const res = applyInboundMessages(stored, [{ externalId: "n", contact: {}, inbound: "x", channel: "social" }], "r", NOW);
  assert.ok(res.drafts.some((d) => d.id === "d_human"), "a human's draft is not intake overflow");
  assert.equal(res.evicted, 1);
});

test("an inbound draft that a human has ACTED on is no longer evictable intake", () => {
  const answered = { ...inboundDraft(0), status: "approved", reply: "odpověď" };
  const stored = [answered, ...Array.from({ length: INBOUND_PENDING_CAP }, (_, i) => inboundDraft(i + 1))];
  const res = applyInboundMessages(stored, [{ externalId: "n", contact: {}, inbound: "x", channel: "social" }], "r", NOW);
  assert.ok(res.drafts.some((d) => d.id === answered.id));
});

test("applyInboundToState preserves every other section of the blob", () => {
  const prev = {
    voices: [{ scope: "generic", directives: "d", traits: [], lengthHint: "", constraints: [], examples: [], updatedAt: NOW }],
    channels: [],
    facts: [{ id: "f1", scope: "generic", question: "", answer: "a", source: "sample", createdAt: NOW }],
    drafts: [],
  };
  const { state, result } = applyInboundToState(prev, normalizeInbound("social", META_PAYLOAD), "r", NOW);
  assert.equal(result.accepted, 2);
  assert.deepEqual(state.voices, prev.voices);
  assert.deepEqual(state.facts, prev.facts);
  assert.equal(state.updatedAt, NOW);
});

// ── credentials ───────────────────────────────────────────────────────────────

test("the Meta verify token is SHA-256(secret) — never the secret itself", () => {
  const vt = metaVerifyToken(SECRET);
  assert.match(vt, /^[0-9a-f]{64}$/);
  assert.notEqual(vt, SECRET);
  assert.equal(vt.includes(SECRET), false);
});

test("safeEqual is total: equal strings true, different strings false, junk false", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", undefined), false);
  assert.equal(safeEqual(null, null), false);
});

test("the Meta signature is an HMAC over the RAW body under the endpoint secret", () => {
  const raw = JSON.stringify(META_PAYLOAD);
  const expected = `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
  assert.equal(metaSignatureHeader(SECRET, raw), expected);
  assert.equal(verifyMetaSignature(SECRET, raw, expected), true);
});

test("ACCEPTANCE — a tampered body fails the Meta signature", () => {
  const raw = JSON.stringify(META_PAYLOAD);
  const header = metaSignatureHeader(SECRET, raw);
  assert.equal(verifyMetaSignature(SECRET, `${raw} `, header), false);
  assert.equal(verifyMetaSignature("another-secret", raw, header), false);
  assert.equal(verifyMetaSignature(SECRET, raw, "sha256=deadbeef"), false);
  assert.equal(verifyMetaSignature(SECRET, raw, ""), false);
});

test("the Adamant flavour is replay-BOUNDED where the Meta flavour is not", () => {
  const raw = '{"from":"a@b.cz","text":"ahoj"}';
  const now = Date.parse("2026-08-30T09:00:00.000Z");
  const ts = new Date(now).toISOString();
  const header = signatureHeader(SECRET, ts, raw);
  assert.equal(verifyOutboundSignature(SECRET, ts, raw, header, now), true);
  // Ten minutes later the same captured request is refused…
  assert.equal(verifyOutboundSignature(SECRET, ts, raw, header, now + 10 * 60_000), false);
  // …while Meta's timestamp-less flavour still verifies, which is exactly why the
  // intake has to be idempotent (pinned above) rather than relying on the window.
  const hub = metaSignatureHeader(SECRET, raw);
  assert.equal(verifyMetaSignature(SECRET, raw, hub), true);
});
