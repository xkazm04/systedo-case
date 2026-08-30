/** Outbound delivery seam for the twin's approved drafts.
 *
 *  Adamant has no messaging integrations yet: nothing here actually puts a message
 *  on a wire. That is the point of the seam — the twin already knows a draft is
 *  approved and which channel it belongs to, so the only missing piece is a
 *  `send()`. Today the sole registered connector is `manual`, which reports
 *  `delivered: false` and hands the text back for a human to paste. When a real
 *  Slack/SMTP/WhatsApp connector arrives it implements this interface, declares the
 *  channels it serves, reads its own credentials, and drops into `CONNECTORS` —
 *  no caller changes.
 *
 *  Server-only by convention: a real connector will hold secrets. The client only
 *  ever sees `ConnectorInfo` (id + label + configured), never the module itself. */
import { sendEmail } from "@/lib/email";
import { SITE_NAME } from "@/lib/site";
import type { TwinChannel } from "./types";

export interface SendResult {
  /** true only when a real integration actually transmitted the message */
  delivered: boolean;
  /** `manual` = the human must send it; `api` = a connector transmitted it */
  mode: "manual" | "api";
  /** human-readable note, surfaced in the outbox */
  detail?: string;
}

export interface SendPayload {
  channel: TwinChannel;
  /** the DISPLAY label (a name or a handle) — never an address */
  contact: string;
  body: string;
  /** WP S2 — the delivery address. Required by any connector whose
   *  {@link TwinConnector.requiresAddress} is true; the caller refuses the send
   *  before it gets here when the draft has none. */
  to?: string;
  /** WP S2 — the subject line, for connectors that have one (e-mail). */
  subject?: string;
}

export interface TwinConnector {
  id: string;
  label: string;
  labelEn: string;
  /** channels this connector can deliver to */
  channels: readonly TwinChannel[];
  /** whether its credentials are present in this environment */
  configured: boolean;
  /** WP S2 — true when `send` genuinely puts the message on a wire and therefore
   *  needs an addressable `to`. The `manual` connector does not (a human sends it),
   *  and this flag is what lets the delivery path refuse an address-less draft
   *  BEFORE it reaches a provider instead of mailing a name string. */
  requiresAddress?: boolean;
  send(payload: SendPayload): Promise<SendResult>;
}

/** The default, always-available connector: it never transmits. Marking a draft
 *  "sent" through it records the human's own send — which is exactly what happens
 *  today, so the outbox tells the truth instead of implying a delivery. */
const manual: TwinConnector = {
  id: "manual",
  label: "Ruční odeslání",
  labelEn: "Manual send",
  channels: ["leads", "email", "chat", "social", "reviews", "sms", "whatsapp"],
  configured: true,
  async send() {
    return {
      delivered: false,
      mode: "manual",
      detail: "Zkopírujte text a odešlete ho svým kanálem — Adamant zprávu neodesílá.",
    };
  },
};

/** Minimal HTML for a plain-text reply: escape everything, then turn newlines into
 *  breaks. No template, no styling, no tracking pixel — the twin writes a message a
 *  person reads, and wrapping it in marketing chrome would change what the operator
 *  approved. Exported so a fixture can pin the escaping. */
export function renderEmailHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<div>${escaped.replace(/\r\n?|\n/g, "<br>")}</div>`;
}

/** Longest subject we will mint from an inbound message. */
export const SUBJECT_MAX = 80;

/** `Re: <first line of what we are answering>`, or the brand name when there is
 *  nothing to quote. Pure, so both the connector and its fixture agree. */
export function replySubject(inbound: string, brand: string = SITE_NAME): string {
  const first = (inbound ?? "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  if (!first) return brand;
  return `Re: ${first.slice(0, SUBJECT_MAX)}`;
}

/** WP S2 — THE FIRST REAL CONNECTOR. It sends over the same Resend sender the crons
 *  already use (`lib/email.sendEmail`), so this deployment gains outbound twin mail
 *  the moment `RESEND_API_KEY` is set and gains nothing — silently and safely —
 *  when it is not (`configured: false` keeps it out of the picker, and the delivery
 *  gate refuses `connector-unconfigured` before anything is claimed).
 *
 *  It THROWS on failure because that is how `TwinConnector.send` signals one:
 *  `sendEmail` returns `false` for a non-2xx or a thrown fetch, and returning
 *  `{ delivered: false }` here would mark the draft `sent` while nothing left the
 *  building — the exact lie the send claim's revert path exists to prevent.
 *
 *  The retired id `email-smtp` (and its `TWIN_SMTP_URL` env) is gone: the transport
 *  is a hosted API, not an SMTP URL. `storableConnectorId` maps the old id here so a
 *  stored blob naming it keeps working. */
const email: TwinConnector = {
  id: "email",
  label: "E-mail (Resend)",
  labelEn: "Email (Resend)",
  channels: ["email", "leads"],
  configured: Boolean(process.env.RESEND_API_KEY),
  requiresAddress: true,
  async send({ to, subject, body }) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("Email connector is not configured (RESEND_API_KEY missing).");
    }
    // Belt and braces: the delivery gate already refuses an address-less draft, but a
    // connector that could be handed an empty `to` must not silently post one.
    if (!to) throw new Error("Email connector called without a delivery address.");
    const ok = await sendEmail(to, subject || SITE_NAME, renderEmailHtml(body));
    if (!ok) throw new Error("Resend refused the message (see the [email] server log).");
    return { delivered: true, mode: "api", detail: `Odesláno na ${to}.` };
  },
};

export const CONNECTORS: readonly TwinConnector[] = [manual, email];

/** Connector ids that no longer exist, mapped to their successor. A stored channel
 *  config naming a retired id must not strand its approved drafts — and must not
 *  silently degrade to `manual` either, which would report "you send it yourself"
 *  about a channel the operator had wired up. */
const RETIRED_CONNECTOR_IDS: Record<string, string> = { "email-smtp": "email" };

/** Unknown ids fall back to `manual` — a bad connector id must never strand an
 *  approved draft. */
export function connectorFor(id: string): TwinConnector {
  const resolved = RETIRED_CONNECTOR_IDS[id] ?? id;
  return CONNECTORS.find((c) => c.id === resolved) ?? manual;
}

/** The connector id safe to STORE for a channel config. A known AND configured id keeps
 *  its id (a RETIRED id is first mapped to its successor, so a blob saying
 *  "email-smtp" is rewritten to "email" rather than degraded); an unknown id (a typo
 *  like "email-smpt") OR a known-but-unconfigured id
 *  (e.g. "email" while RESEND_API_KEY is unset) degrades to "manual". This makes the
 *  invariant "a stored channel config always names a usable connector" true at the write
 *  boundary, collapsing the two prior failure shapes (an unknown id silently degrading to
 *  manual vs. a known-unconfigured id throwing at send time) into one predictable rule.
 *  Server-side because `configured` is env-dependent — the twin save route calls this. */
export function storableConnectorId(id: string): string {
  const c = connectorFor(id);
  return c.configured ? c.id : "manual";
}

/** The client-safe projection — no `send`, no secrets. */
export interface ConnectorInfo {
  id: string;
  label: string;
  labelEn: string;
  channels: readonly TwinChannel[];
  configured: boolean;
}

export function connectorInfo(): ConnectorInfo[] {
  return CONNECTORS.map(({ id, label, labelEn, channels, configured }) => ({
    id,
    label,
    labelEn,
    channels,
    configured,
  }));
}
