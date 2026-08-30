/** WP S2 — the PURE half of "a real message leaves the app": the delivery gate, the
 *  two new channel-config fields and their sanitizer, the address rule that stops a
 *  reply being mailed to a name, and the e-mail connector's own pure helpers.
 *
 *  Everything here is side-effect free, so the matrix (enabled × connector ×
 *  weekly cap × consent) is pinned without a store, a clock or a network. The
 *  autonomy axis is NOT part of this gate on purpose — an `assist` channel may still
 *  be delivered by a human clicking send, and it is the DISPATCHER that refuses to
 *  act on its own there (see twin-dispatch-step.test.mjs). */
import { test } from "node:test";
import assert from "node:assert/strict";

// The connector registry reads its credentials at module load.
process.env.RESEND_API_KEY = "re_test_key";

const {
  decideDelivery,
  defaultConsentRequired,
  channelConfig,
  isEmailShaped,
  sanitizeTwinState,
  MAX_MAX_PER_WEEK,
} = await import("@/lib/twin/types");
const { connectorFor, storableConnectorId, renderEmailHtml, replySubject, CONNECTORS } = await import(
  "@/lib/twin/connectors"
);
const { CONSENT_PURPOSE_BY_CHANNEL, consentPurposeFor, sentThisWeek } = await import("@/lib/twin/deliver");

const cfg = (patch = {}) => ({
  channel: "email",
  enabled: true,
  autonomy: "assist",
  connector: "email",
  autoThreshold: 80,
  ...patch,
});
const draft = { channel: "email" };
const ctx = (patch = {}) => ({ sentThisWeek: 0, consentOk: true, connectorConfigured: true, ...patch });

/* ── the matrix ─────────────────────────────────────────────────────────────── */

test("gate: an enabled channel with a configured connector, no cap and no consent gate allows", () => {
  assert.deepEqual(decideDelivery(cfg(), draft, ctx()), { allowed: true });
});

test("gate: a DISABLED channel refuses, however good everything else looks", () => {
  assert.deepEqual(decideDelivery(cfg({ enabled: false }), draft, ctx()), {
    allowed: false,
    reason: "disabled",
  });
});

test("gate: an unconfigured connector refuses before any cap or consent question", () => {
  const v = decideDelivery(cfg({ maxPerWeek: 1, consentRequired: true }), draft, ctx({ connectorConfigured: false, sentThisWeek: 9, consentOk: false }));
  assert.deepEqual(v, { allowed: false, reason: "connector-unconfigured" });
});

test("gate: the weekly cap refuses at >= cap, and the send BEFORE it is allowed", () => {
  assert.deepEqual(decideDelivery(cfg({ maxPerWeek: 1 }), draft, ctx({ sentThisWeek: 0 })), { allowed: true });
  assert.deepEqual(decideDelivery(cfg({ maxPerWeek: 1 }), draft, ctx({ sentThisWeek: 1 })), {
    allowed: false,
    reason: "cap-exceeded",
  });
  assert.deepEqual(decideDelivery(cfg({ maxPerWeek: 3 }), draft, ctx({ sentThisWeek: 2 })), { allowed: true });
  assert.deepEqual(decideDelivery(cfg({ maxPerWeek: 3 }), draft, ctx({ sentThisWeek: 3 })), {
    allowed: false,
    reason: "cap-exceeded",
  });
});

test("gate: NO cap means never capped, whatever the week's count", () => {
  assert.deepEqual(decideDelivery(cfg(), draft, ctx({ sentThisWeek: 10_000 })), { allowed: true });
});

test("gate: consent FAILS CLOSED — false and null both refuse, only true allows", () => {
  const c = cfg({ consentRequired: true });
  assert.deepEqual(decideDelivery(c, draft, ctx({ consentOk: true })), { allowed: true });
  assert.deepEqual(decideDelivery(c, draft, ctx({ consentOk: false })), {
    allowed: false,
    reason: "consent-required",
  });
  assert.deepEqual(decideDelivery(c, draft, ctx({ consentOk: null })), {
    allowed: false,
    reason: "consent-required",
  });
});

test("gate: with the consent gate OFF, an unknown consent is irrelevant", () => {
  assert.deepEqual(decideDelivery(cfg({ consentRequired: false }), draft, ctx({ consentOk: null })), {
    allowed: true,
  });
});

test("gate: an OLD blob (no consentRequired field) reads as the channel default", () => {
  // sms defaults ON — an unknown consent therefore refuses…
  assert.deepEqual(decideDelivery(cfg({ channel: "sms" }), { channel: "sms" }, ctx({ consentOk: null })), {
    allowed: false,
    reason: "consent-required",
  });
  // …while email defaults OFF and is allowed on the very same context.
  assert.deepEqual(decideDelivery(cfg({ channel: "email" }), draft, ctx({ consentOk: null })), { allowed: true });
});

test("gate: the cap is judged BEFORE consent (the operator reads the nearer limit)", () => {
  const v = decideDelivery(cfg({ maxPerWeek: 1, consentRequired: true }), draft, ctx({ sentThisWeek: 5, consentOk: false }));
  assert.equal(v.allowed, false);
  assert.equal(v.reason, "cap-exceeded");
});

test("gate: a draft judged against ANOTHER channel's config refuses (caller bug ⇒ do not send)", () => {
  assert.deepEqual(decideDelivery(cfg({ channel: "email" }), { channel: "sms" }, ctx()), {
    allowed: false,
    reason: "disabled",
  });
});

/* ── defaults + sanitizer ───────────────────────────────────────────────────── */

test("consent is required BY DEFAULT exactly on the two marketing channels", () => {
  assert.equal(defaultConsentRequired("sms"), true);
  assert.equal(defaultConsentRequired("whatsapp"), true);
  for (const ch of ["leads", "email", "chat", "social", "reviews"]) {
    assert.equal(defaultConsentRequired(ch), false, `${ch} is service communication`);
  }
});

test("channelConfig's fallback for an unconfigured channel carries the consent default", () => {
  assert.equal(channelConfig([], "sms").consentRequired, true);
  assert.equal(channelConfig([], "email").consentRequired, false);
  assert.equal(channelConfig([], "email").maxPerWeek, undefined, "no invented cap");
});

test("sanitizer: a valid cap survives, a junk one is DROPPED rather than clamped to 1", () => {
  const keep = sanitizeTwinState({ channels: [{ channel: "email", enabled: true, maxPerWeek: 4 }] }).channels[0];
  assert.equal(keep.maxPerWeek, 4);
  for (const bad of [0, -3, "5", null, NaN]) {
    const s = sanitizeTwinState({ channels: [{ channel: "email", enabled: true, maxPerWeek: bad }] }).channels[0];
    assert.equal(s.maxPerWeek, undefined, `${String(bad)} is not a cap`);
  }
  const huge = sanitizeTwinState({ channels: [{ channel: "email", maxPerWeek: 99_999 }] }).channels[0];
  assert.equal(huge.maxPerWeek, MAX_MAX_PER_WEEK);
});

test("sanitizer: a channel blob written BEFORE S2 reads back with the consent default", () => {
  const legacy = sanitizeTwinState({
    channels: [{ channel: "whatsapp", enabled: true, autonomy: "auto", connector: "manual", autoThreshold: 90 }],
  }).channels[0];
  assert.equal(legacy.consentRequired, true);
  assert.equal(legacy.maxPerWeek, undefined);
});

test("sanitizer: a draft's `to` must be ADDRESS-shaped on an addressed channel", () => {
  const ok = sanitizeTwinState({
    drafts: [{ channel: "email", reply: "x", to: "jana@example.cz", contactId: "c1" }],
  }).drafts[0];
  assert.equal(ok.to, "jana@example.cz");
  assert.equal(ok.contactId, "c1");

  const named = sanitizeTwinState({ drafts: [{ channel: "email", reply: "x", to: "Jana N." }] }).drafts[0];
  assert.equal("to" in named, false, "a NAME is never stored as a delivery address");

  // On a handle channel there is no address rule to apply — the value is just bounded.
  const handle = sanitizeTwinState({ drafts: [{ channel: "social", reply: "x", to: "@jana" }] }).drafts[0];
  assert.equal(handle.to, "@jana");
});

test("sanitizer: `sentAt` still round-trips (the mint moved, the read path did not)", () => {
  const d = sanitizeTwinState({
    drafts: [{ channel: "email", reply: "x", status: "sent", sentAt: "2026-08-30T10:00:00.000Z" }],
  }).drafts[0];
  assert.equal(d.sentAt, "2026-08-30T10:00:00.000Z");
  const none = sanitizeTwinState({ drafts: [{ channel: "email", reply: "x" }] }).drafts[0];
  assert.equal("sentAt" in none, false);
});

test("isEmailShaped refuses a name, a bare local part and a domain without a dot", () => {
  assert.equal(isEmailShaped("jana@example.cz"), true);
  assert.equal(isEmailShaped("Jana N."), false);
  assert.equal(isEmailShaped("jana@"), false);
  assert.equal(isEmailShaped("jana@localhost"), false);
  assert.equal(isEmailShaped("a b@c.cz"), false);
});

/* ── connectors ─────────────────────────────────────────────────────────────── */

test("the retired `email-smtp` id resolves to the `email` connector, never to a strand", () => {
  assert.equal(connectorFor("email-smtp").id, "email");
  assert.equal(storableConnectorId("email-smtp"), "email", "a stored blob is rewritten forward");
  assert.equal(connectorFor("email-smpt").id, "manual", "a TYPO still degrades to manual");
});

test("the email connector declares an address requirement; manual does not", () => {
  assert.equal(connectorFor("email").requiresAddress, true);
  assert.equal(connectorFor("email").configured, true, "RESEND_API_KEY is set in this suite");
  assert.equal(Boolean(connectorFor("manual").requiresAddress), false);
  assert.deepEqual(CONNECTORS.map((c) => c.id), ["manual", "email"], "no SMTP placeholder is left behind");
});

test("the reply subject quotes the first line, bounded; an empty inbound falls back to the brand", () => {
  assert.equal(replySubject("Kolik to stojí?\nDěkuji"), "Re: Kolik to stojí?");
  assert.equal(replySubject("\n\n  Skladem?  \n"), "Re: Skladem?");
  assert.equal(replySubject("x".repeat(200)).length, 4 + 80);
  assert.equal(replySubject("", "Adamant"), "Adamant");
});

test("the HTML body escapes markup and keeps line breaks — no template, no tracking", () => {
  assert.equal(renderEmailHtml("a<b>&\"c\"\nd"), "<div>a&lt;b&gt;&amp;&quot;c&quot;<br>d</div>");
});

/* ── the consent purpose map + the week counter ─────────────────────────────── */

test("the consent purpose map is the one documented in deliver.ts", () => {
  assert.deepEqual(CONSENT_PURPOSE_BY_CHANNEL, {
    leads: "service",
    email: "marketing_email",
    chat: "service",
    social: "service",
    reviews: "service",
    sms: "marketing_sms",
    whatsapp: "marketing_sms",
  });
  assert.equal(consentPurposeFor("whatsapp"), "marketing_sms");
});

test("sentThisWeek counts only SENT drafts on the SAME channel inside the same ISO week", () => {
  const at = "2026-08-26T12:00:00.000Z"; // a Wednesday
  const drafts = [
    { channel: "email", status: "sent", sentAt: "2026-08-24T08:00:00.000Z" }, // Monday, same week
    { channel: "email", status: "sent", sentAt: "2026-08-26T09:00:00.000Z" }, // same day
    { channel: "email", status: "sent", sentAt: "2026-08-17T09:00:00.000Z" }, // last week
    { channel: "email", status: "approved" }, // approved, not sent
    { channel: "sms", status: "sent", sentAt: "2026-08-26T09:00:00.000Z" }, // another channel
    { channel: "email", status: "sent" }, // sent without a stamp — uncountable
  ];
  assert.equal(sentThisWeek(drafts, "email", at), 2);
  assert.equal(sentThisWeek(drafts, "sms", at), 1);
  assert.equal(sentThisWeek(drafts, "chat", at), 0);
  assert.equal(sentThisWeek(drafts, "email", "not-a-date"), 0, "an unreadable now counts nothing");
});
