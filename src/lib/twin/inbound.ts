/** INBOUND MESSAGE INTAKE — the pure half (WP W3-D).
 *
 *  A real message from a platform (a Meta page comment/DM, a forwarded e-mail, a Google
 *  Business review) becomes a PENDING `TwinDraft` with an empty `reply` — the model
 *  already says `inbound` is "the message being answered" (types.ts:152-176), so an
 *  arriving message needs no new entity: it is a draft nobody has written yet. The
 *  Schránka is therefore the single review surface for both halves of a conversation.
 *
 *  Everything here is PURE (node:crypto only, no I/O, no store, no route), so the wire
 *  shapes, the tag-stripping, the clamps, the idempotency key, the 200-draft cap and the
 *  eviction rule all carry fixtures without a socket. The route (../../app/api/twin/
 *  inbound/[token]/route.ts) does the signature check and the ONE `mutateTwin` write.
 *
 *  WHAT THIS FILE DELIBERATELY CANNOT DO: mint a `sent` record. Every draft it builds is
 *  `status: "pending"`, `autoApproved: false`, and carries NO `sentAt` — an intake that
 *  could produce a send would be an outbound path wearing an inbound name. `sentAt` is
 *  still minted in exactly one place in the repo (twin/send/route.ts's atomic claim).
 *
 *  SURVIVAL NOTE (why `reply: ""` persists): the twin's sanitizer used to drop any draft
 *  with an empty reply, and it runs on the READ path too (persisted.ts), so an inbound
 *  record would have been deleted on the very next read. `sanitizeDraft` now asks for
 *  content on EITHER side of the conversation — a reply OR an inbound body — which keeps
 *  the original rule's purpose (drop an empty shell) while admitting the message that
 *  has not been answered yet. Both halves are pinned in test-unit/twin-inbound. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isTwinChannel, type TwinChannel, type TwinDraft, type TwinState } from "./types";
import { INBOUND_ID_PREFIX, isInboundDraft } from "./inbound-id";

/* -------------------------------------------------------------------------- */
/*  Contract                                                                   */
/* -------------------------------------------------------------------------- */

/** One normalized message, whatever wire shape it arrived in. */
export interface InboundMessage {
  /** the platform's own id for the message, when it supplies one — the strongest
   *  idempotency key there is (a re-delivered webhook repeats it verbatim). */
  externalId?: string;
  contact: { name?: string; handle?: string };
  inbound: string;
  channel: TwinChannel;
}

/** Hard clamp on a stored inbound body. Long enough for a real review or e-mail,
 *  short enough that a hostile payload cannot inflate the twin blob. */
export const INBOUND_TEXT_MAX = 2000;

/** How many INBOUND-minted pending drafts one project may hold. Beyond this the
 *  OLDEST inbound-pending record is evicted — never an operator-created draft (see
 *  {@link applyInboundMessages}). */
export const INBOUND_PENDING_CAP = 200;

// The id prefix and its predicate live in ./inbound-id (no node: imports) so the
// Schránka's client component can read a draft's provenance without pulling node:crypto
// into the browser bundle. Re-exported here so every server caller keeps one import.
export { INBOUND_ID_PREFIX, isInboundDraft } from "./inbound-id";

/** Most messages one POST may mint. A page webhook batches; a batch this large is
 *  already pathological, and the cap bounds the single `mutateTwin` write. */
export const INBOUND_BATCH_MAX = 50;

/** Longest contact label kept (matches `sanitizeDraft`'s own contact clamp). */
const CONTACT_MAX = 120;

/* -------------------------------------------------------------------------- */
/*  Text hygiene                                                               */
/* -------------------------------------------------------------------------- */

/** Strip markup, collapse whitespace, clamp. Deliberately OVER-strips: `<script>` /
 *  `<style>` bodies go whole, then anything between angle brackets goes, so a plain
 *  sentence containing `a < b and c > d` loses its middle. That trade is correct here —
 *  this text is rendered into an operator's inbox and quoted into a model prompt, and
 *  no HTML has ever been meaningful in either place. Entities are NOT decoded: decoding
 *  after stripping would be a way to re-introduce the very `<` we just removed. */
export function stripInboundText(v: unknown, max: number = INBOUND_TEXT_MAX): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** A short label (a name, a handle, an e-mail address) — same hygiene, tighter clamp. */
function label(v: unknown): string {
  return stripInboundText(v, CONTACT_MAX).replace(/\n+/g, " ").trim();
}

/** A provider-side IDENTIFIER (a Graph mid, an RFC-5322 Message-ID, a GBP resource
 *  name). Deliberately NOT tag-stripped: `<abc@mail.example>` is the canonical shape of
 *  a mail message id, and running the markup stripper over it would delete the whole
 *  value — turning the strongest idempotency key we have into an empty string, which
 *  falls back to content hashing and silently weakens de-duplication. It is never
 *  rendered as markup (it only ever feeds a hash), so it needs bounding, not stripping. */
function identifier(v: unknown): string {
  // Control characters only - they would corrupt a log line or a header echo.
  // Every printable byte a provider chose for its own id is kept verbatim.
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) : "";
}

/** Join the parts of a message body (an e-mail subject + text, a review's rating +
 *  comment) into the one `inbound` string, then clamp ONCE at the end so the clamp is a
 *  property of the stored record rather than of whichever part happened to be long. */
function body(parts: (string | undefined)[]): string {
  return stripInboundText(parts.filter((p) => p && p.length > 0).join("\n\n"));
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/* -------------------------------------------------------------------------- */
/*  Wire shapes                                                                */
/* -------------------------------------------------------------------------- */

/** Which wire dialect an endpoint's channel speaks. The endpoint is minted per
 *  (project, CHANNEL) — the channel is the operator's choice of surface — and the
 *  dialect follows from it rather than from anything the caller sends: a `social`
 *  endpoint is a Meta page webhook, a `reviews` endpoint is the Google Business
 *  review/question shape, and every other channel takes the generic mail-forwarder
 *  JSON, which is the shape any forwarder, form or bridge can already produce. */
export type InboundFlavour = "meta" | "email" | "gbp";

export function inboundFlavour(channel: TwinChannel): InboundFlavour {
  if (channel === "social") return "meta";
  if (channel === "reviews") return "gbp";
  return "email";
}

/** Meta page webhook. Two sub-shapes ride the same envelope and both are real:
 *  `entry[].messaging[]` (a DM) and `entry[].changes[].value` (a feed comment). */
function normalizeMeta(channel: TwinChannel, raw: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entryRaw of arr(obj(raw).entry)) {
    const entry = obj(entryRaw);
    for (const mRaw of arr(entry.messaging)) {
      const m = obj(mRaw);
      const message = obj(m.message);
      const sender = obj(m.sender);
      const text = body([stripInboundText(message.text)]);
      if (!text) continue;
      out.push({
        ...(typeof message.mid === "string" && message.mid ? { externalId: identifier(message.mid) } : {}),
        contact: contactOf(sender.name, sender.id ?? sender.username),
        inbound: text,
        channel,
      });
    }
    for (const cRaw of arr(entry.changes)) {
      const value = obj(obj(cRaw).value);
      const from = obj(value.from);
      const text = body([stripInboundText(value.message ?? value.text)]);
      if (!text) continue;
      const id = value.comment_id ?? value.post_id;
      out.push({
        ...(typeof id === "string" && id ? { externalId: identifier(id) } : {}),
        contact: contactOf(from.name, from.id ?? from.username),
        inbound: text,
        channel,
      });
    }
  }
  return out;
}

/** The generic mail-forwarder shape: `{ from, subject, text }`, or a `messages: []`
 *  array of them. Nothing provider-specific — this is what a Zapier/Make/n8n step, a
 *  contact form, or a two-line SMTP forwarder can already POST. */
function normalizeEmail(channel: TwinChannel, raw: unknown): InboundMessage[] {
  const root = obj(raw);
  const items = arr(root.messages).length > 0 ? arr(root.messages) : [root];
  const out: InboundMessage[] = [];
  for (const itemRaw of items) {
    const m = obj(itemRaw);
    const text = body([stripInboundText(m.subject), stripInboundText(m.text ?? m.body)]);
    if (!text) continue;
    const id = m.messageId ?? m.message_id ?? m.id;
    out.push({
      ...(typeof id === "string" && id ? { externalId: identifier(id) } : {}),
      contact: contactOf(m.fromName ?? m.name, m.from ?? m.email),
      inbound: text,
      channel,
    });
  }
  return out;
}

/** Google Business Profile: a review (`reviews[]`) and/or a question (`questions[]`).
 *  The star rating rides INTO the body rather than into a field of its own — this store
 *  holds a message to answer, not a ratings table, and the operator answering it needs
 *  to see the rating in the text they are replying to. */
function normalizeGbp(channel: TwinChannel, raw: unknown): InboundMessage[] {
  const root = obj(raw);
  const out: InboundMessage[] = [];
  const reviews = arr(root.reviews).length > 0 ? arr(root.reviews) : root.reviewId || root.comment ? [root] : [];
  for (const rRaw of reviews) {
    const r = obj(rRaw);
    const stars = typeof r.starRating === "string" || typeof r.starRating === "number" ? `★ ${r.starRating}` : "";
    const text = body([stars, stripInboundText(r.comment ?? r.text)]);
    if (!text) continue;
    const id = r.reviewId ?? r.name;
    out.push({
      ...(typeof id === "string" && id ? { externalId: identifier(id) } : {}),
      contact: contactOf(obj(r.reviewer).displayName, undefined),
      inbound: text,
      channel,
    });
  }
  for (const qRaw of arr(root.questions)) {
    const q = obj(qRaw);
    const text = body([stripInboundText(q.text ?? q.question)]);
    if (!text) continue;
    const id = q.questionId ?? q.name;
    out.push({
      ...(typeof id === "string" && id ? { externalId: identifier(id) } : {}),
      contact: contactOf(obj(q.author).displayName, undefined),
      inbound: text,
      channel,
    });
  }
  return out;
}

function contactOf(name: unknown, handle: unknown): { name?: string; handle?: string } {
  const n = label(name);
  const h = label(handle);
  return { ...(n ? { name: n } : {}), ...(h ? { handle: h } : {}) };
}

/** Normalize an arbitrary intake payload into bounded messages for the endpoint's
 *  channel. Unknown fields are dropped by construction (nothing is spread from the
 *  wire), empty bodies are dropped entirely, and the batch is capped. Never throws — a
 *  shape it does not recognise is simply zero messages, which the route reports as
 *  `accepted: 0` rather than as an error the sender would retry forever. */
export function normalizeInbound(channel: TwinChannel, raw: unknown): InboundMessage[] {
  if (!isTwinChannel(channel)) return [];
  const flavour = inboundFlavour(channel);
  const msgs =
    flavour === "meta"
      ? normalizeMeta(channel, raw)
      : flavour === "gbp"
        ? normalizeGbp(channel, raw)
        : normalizeEmail(channel, raw);
  return msgs.slice(0, INBOUND_BATCH_MAX);
}

/* -------------------------------------------------------------------------- */
/*  Identity + the twin write                                                  */
/* -------------------------------------------------------------------------- */

/** The idempotency key: `in_<16 hex>` over the platform's own message id when there is
 *  one, else over the RAW BODY plus this message's own content.
 *
 *  Why both halves of the fallback: raw-body-only would collapse two DIFFERENT messages
 *  in one batch into a single draft (a page webhook delivers several at once), and
 *  content-only would let two genuinely repeated identical messages become one. Together
 *  they make a re-delivery of the exact same bytes idempotent — which IS the replay case
 *  webhooks actually produce — while keeping distinct messages distinct. */
export function inboundDraftId(msg: InboundMessage, raw: string): string {
  const seed = msg.externalId ?? `${raw}\u0000${msg.channel}\u0000${msg.contact.handle ?? ""}\u0000${msg.inbound}`;
  return INBOUND_ID_PREFIX + createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

/** Build the pending draft one message becomes. `risks: ["inbound"]` is not decoration:
 *  a non-empty risk list is what {@link import("./types").decideDraft} treats as "a
 *  human owes this a read", so an arriving message can never be auto-approved into an
 *  outbound reply even on an `auto` channel. */
export function buildInboundDraft(msg: InboundMessage, id: string, createdAt: string): TwinDraft {
  return {
    id,
    channel: msg.channel,
    contact: (msg.contact.name || msg.contact.handle || "").slice(0, CONTACT_MAX),
    inbound: msg.inbound,
    reply: "",
    questions: [],
    confidence: 0,
    risks: ["inbound"],
    status: "pending",
    autoApproved: false,
    createdAt,
  };
}

export interface InboundApplyResult {
  drafts: TwinDraft[];
  accepted: number;
  duplicates: number;
  evicted: number;
}

/** Append the batch to the stored drafts, skipping ids already present, then enforce
 *  the inbound-pending cap by evicting the OLDEST inbound-pending records.
 *
 *  Two invariants the eviction must not break, both pinned:
 *   • an OPERATOR-created draft is never evicted, however full the inbox is — the id
 *     prefix is the only thing consulted, and a human's record has none;
 *   • an inbound draft that has left `pending` (a human replied, approved, rejected or
 *     sent it) is never evicted either: it stopped being unread intake and became an
 *     audit record the archive path owns.
 *
 *  Pure and total, so it runs INSIDE `mutateTwin`'s transaction (the mutator may re-run
 *  and must have no side effects). */
export function applyInboundMessages(
  prev: TwinDraft[],
  msgs: readonly InboundMessage[],
  raw: string,
  createdAt: string
): InboundApplyResult {
  const seen = new Set(prev.map((d) => d.id));
  const next = [...prev];
  let accepted = 0;
  let duplicates = 0;
  for (const msg of msgs) {
    const id = inboundDraftId(msg, raw);
    if (seen.has(id)) {
      duplicates++;
      continue;
    }
    seen.add(id);
    next.push(buildInboundDraft(msg, id, createdAt));
    accepted++;
  }

  const evictable = next
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => isInboundDraft(d) && d.status === "pending")
    // Oldest first; the array index breaks a same-stamp tie so the result is stable.
    .sort((a, b) => a.d.createdAt.localeCompare(b.d.createdAt) || a.i - b.i);
  const overflow = Math.max(0, evictable.length - INBOUND_PENDING_CAP);
  if (overflow === 0) return { drafts: next, accepted, duplicates, evicted: 0 };
  const drop = new Set(evictable.slice(0, overflow).map(({ i }) => i));
  return {
    drafts: next.filter((_, i) => !drop.has(i)),
    accepted,
    duplicates,
    evicted: overflow,
  };
}

/** The whole mutator, as one pure function of the previous state. */
export function applyInboundToState(
  prev: TwinState | null,
  msgs: readonly InboundMessage[],
  raw: string,
  createdAt: string
): { state: TwinState; result: InboundApplyResult } {
  const base: TwinState = prev ?? { voices: [], channels: [], facts: [], drafts: [] };
  const result = applyInboundMessages(base.drafts, msgs, raw, createdAt);
  return { state: { ...base, drafts: result.drafts, updatedAt: createdAt }, result };
}

/* -------------------------------------------------------------------------- */
/*  Meta's two credential rituals                                              */
/* -------------------------------------------------------------------------- */

/** The value Meta must echo back in `hub.verify_token` when it subscribes.
 *
 *  It is SHA-256(secret) in hex, NEVER the secret: the verify token is pasted into a
 *  Meta app-dashboard field, arrives in a URL query string, and lands in that
 *  platform's logs — none of which a signing secret may survive. Deriving it means the
 *  operator holds ONE credential, and a leak of the verify token reveals nothing about
 *  the HMAC key that actually authenticates payloads. */
export function metaVerifyToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Constant-time compare of two strings of any length (both digested to a fixed 32
 *  bytes first — the cron-auth.ts / verifyOutboundSignature pattern). */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  try {
    return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
  } catch {
    return false;
  }
}

/** Verify Meta's `X-Hub-Signature-256: sha256=<hex>` over the RAW body.
 *
 *  NOTE, said out loud because it is a real asymmetry: Meta sends NO timestamp header,
 *  so this flavour has NO replay window — a captured request stays valid forever
 *  against this endpoint. That is Meta's protocol, not our choice, and it is why the
 *  intake is idempotent by construction (a replayed body mints the same draft ids and
 *  therefore no new drafts). Senders that CAN timestamp should use the Adamant flavour
 *  (`x-adamant-signature`, `verifyOutboundSignature`), which is replay-bounded. */
export function verifyMetaSignature(secret: string, raw: string, header: string): boolean {
  if (!secret || typeof header !== "string") return false;
  return safeEqual(header.trim(), metaSignatureHeader(secret, raw));
}

/** The header value Meta would send for this body — HMAC-SHA256 over the RAW bytes,
 *  keyed by the endpoint secret. Exported so a fixture can sign without
 *  re-implementing the format. */
export function metaSignatureHeader(secret: string, raw: string): string {
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}
