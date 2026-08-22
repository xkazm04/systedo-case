/** Manual connector — the no-op registrar, and the honest default.
 *
 *  It exists for the same reason `twin/connectors.ts`'s `manual` does: the storable
 *  id must ALWAYS resolve to something real, so an unknown or unimplemented
 *  connector degrades here at the write boundary rather than bricking a connection.
 *  It registers nothing, reaches nothing and claims nothing — a contact created
 *  through the UI is simply a contact a human typed in. */
import { clampText, EMAIL_MAX, NAME_MAX, PHONE_MAX, type LeadEvent } from "../types";
import type { ConnectorMeta, LeadConnector, PullOptions, PullResult, StoredLeadConnection } from "./types";

export const MANUAL_META: ConnectorMeta = {
  id: "manual",
  label: "Ručně zadané",
  labelEn: "Entered manually",
  channel: "leads",
  modes: ["poll"],
  needsOAuth: false,
  needsToken: false,
  needsConfig: false,
  implemented: true,
  caveat: "Kontakty zadáváte ručně. Adamant se nikam nepřipojuje ani nic nestahuje.",
  caveatEn: "You enter contacts by hand. Adamant connects to nothing and pulls nothing.",
};

export interface ManualLeadInput {
  name?: string;
  email?: string;
  phone?: string;
  note?: string;
  source?: string;
  campaign?: string;
}

/** Turn a hand-entered form into the same `LeadEvent` a connector would produce, so
 *  a manual contact walks the identical dedup → upsert → score path. `externalId`
 *  is caller-supplied and must be stable for the SUBMISSION (not the person), which
 *  is what makes a double-clicked submit button a no-op. Pure. */
export function manualLeadEvent(
  projectId: string,
  externalId: string,
  input: ManualLeadInput,
  now: Date
): LeadEvent {
  const iso = now.toISOString();
  const name = clampText(input.name, NAME_MAX);
  const email = clampText(input.email, EMAIL_MAX);
  const phone = clampText(input.phone, PHONE_MAX);
  return {
    id: `manual-${externalId}`,
    projectId,
    connectorId: "manual",
    externalId,
    kind: "form_submission",
    occurredAt: iso,
    identity: { ...(name ? { name } : {}), ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
    ...(input.note ? { text: input.note } : {}),
    attribution: {
      source: input.source?.trim() || "manual",
      ...(input.campaign?.trim() ? { campaign: input.campaign.trim() } : {}),
      connectorId: "manual",
      externalId,
    },
    receivedAt: iso,
    status: "pending",
  };
}

export const manualConnector: LeadConnector = {
  meta: MANUAL_META,
  configured: () => true,
  /** Nothing to poll — a human is the transport. Returns empty, never throws. */
  async pull(_conn: StoredLeadConnection, _opts: PullOptions): Promise<PullResult> {
    return { events: [] };
  },
};
