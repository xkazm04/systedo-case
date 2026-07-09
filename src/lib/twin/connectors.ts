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
  contact: string;
  body: string;
}

export interface TwinConnector {
  id: string;
  label: string;
  labelEn: string;
  /** channels this connector can deliver to */
  channels: readonly TwinChannel[];
  /** whether its credentials are present in this environment */
  configured: boolean;
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

/** Placeholder for the first real integration. `configured: false` keeps it out of
 *  the channel picker until credentials exist; it is here so the shape of a real
 *  connector is pinned down and the UI's "not connected" path has something to
 *  render. Sending through an unconfigured connector is a caller error. */
const emailSmtp: TwinConnector = {
  id: "email-smtp",
  label: "E-mail (SMTP)",
  labelEn: "Email (SMTP)",
  channels: ["email", "leads"],
  configured: Boolean(process.env.TWIN_SMTP_URL),
  async send({ body }) {
    if (!process.env.TWIN_SMTP_URL) {
      throw new Error("SMTP connector is not configured (TWIN_SMTP_URL missing).");
    }
    // Intentionally unimplemented: wiring a transport belongs to the integration
    // that turns this on, not to the twin. Failing loudly beats a silent no-op
    // that would mark a draft "sent" while nothing left the building.
    throw new Error(`SMTP connector not implemented (${body.length} chars pending).`);
  },
};

export const CONNECTORS: readonly TwinConnector[] = [manual, emailSmtp];

/** Unknown ids fall back to `manual` — a bad connector id must never strand an
 *  approved draft. */
export function connectorFor(id: string): TwinConnector {
  return CONNECTORS.find((c) => c.id === id) ?? manual;
}

/** Connectors that can serve a channel and have their credentials. */
export function connectorsForChannel(channel: TwinChannel): TwinConnector[] {
  return CONNECTORS.filter((c) => c.configured && c.channels.includes(channel));
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
