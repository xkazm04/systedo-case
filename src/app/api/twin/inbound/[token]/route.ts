/** THE PUBLIC TWIN INTAKE (WP W3-D).
 *
 *    GET  /api/twin/inbound/{token}?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
 *    POST /api/twin/inbound/{token}
 *
 *  Deliberately ANONYMOUS, and that is the whole design rather than an oversight: the
 *  callers are machines — a Meta page webhook, a mail forwarder, a Google Business
 *  bridge — and none of them can sign in. TWO things together are the credential: the
 *  128-bit random token in the path (unguessable, per-(project, channel), revocable by
 *  re-minting from the Schránka panel) and an HMAC over the RAW BODY under that
 *  endpoint's own secret. There is a `route-auth` entry in
 *  .github/security/sast-allowlist.json carrying that reasoning; this handler references
 *  no guard helper on purpose, because the exception belongs in the allowlist where it is
 *  reviewable, not in a comment naming a guard it does not call.
 *
 *  ADR-0002 holds even so, INVERTED CORRECTLY: the route takes NO tenant from the wire.
 *  The token row was written by the owner-guarded management route
 *  (../../../projects/[id]/twin/inbound), and `(userId, projectId, channel)` are read out
 *  of THAT ROW. A caller holding a valid token cannot point it at somebody else's twin,
 *  because the pairing is stored, not supplied.
 *
 *  WHAT IT CAN DO, EXHAUSTIVELY: append pending `TwinDraft`s to ONE project's twin blob
 *  through `mutateTwin`. It cannot send, cannot approve, cannot mint `sentAt`, cannot
 *  read anything back, and spends no AI units. The worst a stolen token buys is the
 *  ability to put unread messages in one project's inbox — bounded at
 *  INBOUND_PENDING_CAP, with operator-written drafts never evicted.
 *
 *  ORDER OF OPERATIONS IS THE SECURITY PROPERTY: read the RAW body, cap it, verify the
 *  signature over those exact bytes, and only THEN parse. Parsing first would run a JSON
 *  parser over unauthenticated input and, worse, would make it possible to sign a
 *  re-serialisation rather than what was sent. */
import { getInboundToken } from "@/lib/twin/inbound-store";
import { decryptSecret } from "@/lib/outbound/secret-crypto";
import { mutateTwin } from "@/lib/twin/store";
import { verifyOutboundSignature, MAX_PAYLOAD_BYTES } from "@/lib/outbound/types";
import {
  applyInboundToState,
  inboundDraftId,
  metaVerifyToken,
  normalizeInbound,
  safeEqual,
  verifyMetaSignature,
  type InboundMessage,
} from "@/lib/twin/inbound";
import { contactKeys } from "@/lib/leads/normalize";
import { findContactByKeys } from "@/lib/leads/store";

/** Hard cap on the accepted body — the outbound bus's own `MAX_PAYLOAD_BYTES` (64 KB).
 *  A page webhook batch is a few kilobytes; anything larger is not a message. */
const MAX_BODY_BYTES = MAX_PAYLOAD_BYTES;

/** Plain text, never a JSON envelope with a reason: every rejection answers with the
 *  SAME body and status, so an unknown token, a wrong signature and a stale timestamp
 *  are indistinguishable to a prober. `no-store` keeps a revoked token's 404 from being
 *  cached against a re-mint. */
function deny(status: 401 | 403 | 404 | 413): Response {
  return new Response(status === 413 ? "Payload too large\n" : "Unauthorized\n", {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Meta's subscribe handshake. The echoed `hub.challenge` proves we control the URL; the
 *  `hub.verify_token` proves the person who configured it holds the endpoint secret.
 *  What is compared is SHA-256(secret) — never the secret — because this value travels in
 *  a query string and lands in the platform's logs. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await getInboundToken(token);
  if (!row) return deny(404);

  const q = new URL(req.url).searchParams;
  const challenge = q.get("hub.challenge") ?? "";
  const secret = decryptSecret(row.secretEnc);
  // A blob that will not open (a rotated key chain) is NOT an authorisation: refuse,
  // exactly as a wrong token would, rather than degrading to "no secret → accept".
  if (q.get("hub.mode") !== "subscribe" || !secret) return deny(403);
  if (!safeEqual(q.get("hub.verify_token") ?? "", metaVerifyToken(secret))) return deny(403);

  return new Response(challenge, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await getInboundToken(token);
  if (!row) return deny(404);

  // RAW FIRST. Nothing below parses anything until the bytes have been authenticated.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return deny(401);
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return deny(413);

  const secret = decryptSecret(row.secretEnc);
  if (!secret) return deny(401); // unopenable blob ⇒ no signature can be checked ⇒ refuse

  if (!signatureOk(req, secret, raw)) return deny(401);

  // Authenticated. The channel comes from the ROW, never from the payload, so a caller
  // cannot decide which of the project's channels its message lands on.
  const messages = normalizeInbound(row.channel, safeParse(raw));

  const now = new Date().toISOString();
  let accepted = 0;
  let duplicates = 0;
  try {
    await mutateTwin(row.projectId, (prev) => {
      // The mutator may RE-RUN inside the transaction, so it assigns (never
      // increments) and has no side effects — the applyTwinCommit contract.
      const { state, result } = applyInboundToState(prev, messages, raw, now);
      accepted = result.accepted;
      duplicates = result.duplicates;
      return state;
    });
  } catch (err) {
    // The twin store is unreachable. Answer 500 so the sender RETRIES — the write is
    // idempotent (the draft ids are a function of the payload), so a retry cannot
    // duplicate anything.
    console.error("[twin] inbound write failed:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, error: "storage-unavailable" }, { status: 500 });
  }

  // WP S2 — best-effort CRM join, strictly AFTER the intake write and strictly
  // non-blocking. It reads the lead store to see whether the address that just wrote
  // to us is already a known contact, and stamps `contactId` on the draft if so. That
  // stamp is what makes the twin's consent gate answerable at all: without it the gate
  // has nobody to look up and (when consent is required) refuses.
  //
  // Everything about it degrades to "no stamp": a CRM outage, an unmatched address, a
  // second write that loses a race. That is correct — an unstamped draft is refused by
  // the delivery gate rather than sent, so a failure here can only ever be MORE
  // conservative, never less.
  if (accepted > 0) await joinContacts(row.projectId, messages, raw);

  // A payload we could not make sense of is `accepted: 0`, not an error: a webhook that
  // gets a 4xx retries forever, and a shape we do not read will never start parsing.
  return Response.json({ ok: true, accepted, duplicates });
}

/** How many CRM lookups one intake POST may make. A batch is capped at 50 messages;
 *  ten lookups is plenty for a real forwarder batch and bounds the work a caller can
 *  cause with one signed request. */
const CONTACT_JOIN_MAX = 10;

async function joinContacts(projectId: string, messages: readonly InboundMessage[], raw: string): Promise<void> {
  try {
    const pairs: Array<{ draftId: string; contactId: string }> = [];
    for (const msg of messages.filter((m) => m.to).slice(0, CONTACT_JOIN_MAX)) {
      const contact = await findContactByKeys(projectId, contactKeys({ email: msg.to }));
      if (contact) pairs.push({ draftId: inboundDraftId(msg, raw), contactId: contact.id });
    }
    if (pairs.length === 0) return;
    const byDraft = new Map(pairs.map((p) => [p.draftId, p.contactId]));
    await mutateTwin(projectId, (prev) => {
      if (!prev) throw new Error("twin vanished between intake and contact join");
      return {
        ...prev,
        // Assign, never increment — the mutator may re-run inside the transaction. An
        // existing stamp is never overwritten: a human's correction outranks a match.
        drafts: prev.drafts.map((d) =>
          !d.contactId && byDraft.has(d.id) ? { ...d, contactId: byDraft.get(d.id) } : d
        ),
      };
    });
  } catch (err) {
    console.error("[twin] inbound contact join failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/** Either signature flavour, both over the RAW body.
 *
 *   • `x-adamant-signature: v1=<hex>` over `${ts}.${raw}` with `x-adamant-timestamp` —
 *     the repo's own outbound format (outbound/types.ts), REPLAY-BOUNDED to a 5-minute
 *     window. Anything we control should send this one.
 *   • `x-hub-signature-256: sha256=<hex>` — HMAC over the raw body alone. Meta sends NO
 *     timestamp header, so this flavour HAS NO REPLAY WINDOW. Said out loud because it
 *     is a real asymmetry, not an oversight: it is safe here only because the intake is
 *     idempotent (a replayed body produces the same draft ids and therefore no new
 *     drafts) and because the endpoint can do nothing but append a pending draft.
 */
function signatureOk(req: Request, secret: string, raw: string): boolean {
  const adamant = req.headers.get("x-adamant-signature");
  if (adamant) {
    return verifyOutboundSignature(secret, req.headers.get("x-adamant-timestamp") ?? "", raw, adamant);
  }
  const hub = req.headers.get("x-hub-signature-256");
  if (hub) return verifyMetaSignature(secret, raw, hub);
  return false;
}

/** Parse AFTER the signature check. A body that is not JSON is `null`, which every
 *  normalizer reads as zero messages. */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
