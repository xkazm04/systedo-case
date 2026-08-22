/** The lead-connector REGISTRY — one list that drives both the ingest engine and the
 *  connect UI, exactly as `inventory/providers.ts` drives both the sync engine and
 *  the provider picker.
 *
 *  Three connectors are real (`manual`, `csv`) or explicitly staged (`gsheet`); the
 *  remaining three are registered with `implemented: false` and the honest caveat
 *  that will otherwise ambush an operator. Those caveats are research findings, not
 *  hedging — see docs/leads/design.md §C1–C3 for the sources, and the [U] list for
 *  the claims that must be re-verified before any of that code is written. */
import { csvConnector } from "./csv";
import { gsheetConnector } from "./gsheet";
import { manualConnector } from "./manual";
import {
  leadConnectorInfo,
  storableLeadConnectorId,
  type ConnectorId,
  type ConnectorMeta,
  type LeadConnector,
  type PullOptions,
  type PullResult,
  type StoredLeadConnection,
} from "./types";

/** A registered-but-unbuilt connector. It answers `pull` honestly (empty + a
 *  reason) instead of throwing, so a cron sweep over mixed connections never dies
 *  on the one that is not ready. */
function stub(meta: ConnectorMeta): LeadConnector {
  return {
    meta,
    configured: () => false,
    async pull(_conn: StoredLeadConnection, _opts: PullOptions): Promise<PullResult> {
      return { events: [], error: `${meta.id}-not-implemented` };
    },
  };
}

export const GMAIL_META: ConnectorMeta = {
  id: "gmail",
  label: "Gmail",
  labelEn: "Gmail",
  channel: "email",
  modes: ["poll", "webhook"],
  needsOAuth: true,
  needsToken: true,
  needsConfig: true,
  implemented: false,
  caveat:
    "Připravujeme. Čtení e-mailů vyžaduje „restricted“ oprávnění Google — tedy ověření aplikace a každoroční bezpečnostní audit (CASA). Plán je nechat vás použít VLASTNÍ projekt v Google Cloud, stejně jako u vlastních AI klíčů. Odběr novinek půjde i za NATem: Pub/Sub v režimu pull nepotřebuje veřejnou adresu.",
  caveatEn:
    "Coming soon. Reading mail needs Google's RESTRICTED scopes — app verification plus an annual CASA security assessment. The plan is to let you use your OWN Google Cloud project, the same way you already can with your own AI keys. It will work behind NAT too: a Pub/Sub PULL subscription needs no public address.",
};

export const WHATSAPP_META: ConnectorMeta = {
  id: "whatsapp",
  label: "WhatsApp",
  labelEn: "WhatsApp",
  channel: "whatsapp",
  // push_only is the honest marker: Meta exposes NO read endpoint, at any tier.
  modes: ["webhook", "push_only"],
  needsOAuth: false,
  needsToken: true,
  needsConfig: true,
  implemented: false,
  caveat:
    "Připravujeme. Pozor: WhatsApp neumí „stahování“ — Meta žádné čtení zpráv nenabízí, zprávy chodí jen webhookem na veřejnou HTTPS adresu. Číslo navíc musí být registrované do Cloud API: existující WhatsApp účet na tom čísle se nenávratně smaže i s historií a číslo už nepůjde používat v aplikaci WhatsApp. Příchozí zprávy jsou zdarma.",
  caveatEn:
    "Coming soon. Note: WhatsApp cannot be polled — Meta exposes no read endpoint at all; messages arrive only by webhook to a public HTTPS address. The number must also be registered to the Cloud API: any existing WhatsApp account on it is permanently deleted along with its history, and the number can no longer be used in the WhatsApp app. Inbound messages are free.",
};

export const LINKEDIN_META: ConnectorMeta = {
  id: "linkedin",
  label: "LinkedIn Lead Sync",
  labelEn: "LinkedIn Lead Sync",
  channel: "leads",
  modes: ["poll", "webhook"],
  needsOAuth: true,
  needsToken: true,
  needsConfig: true,
  implemented: false,
  caveat:
    "Připravujeme. LinkedIn nemá samoobslužný přístup k lead formulářům — schvaluje ho ručně a trvá to měsíce. Do té doby exportujte leady z Campaign Manageru do CSV; LinkedIn je navíc maže po 90 dnech. Čtení LinkedIn zpráv nenabízíme a nabízet nebudeme — API pro to neexistuje a nástroje, které to slibují, riskují zablokování VAŠEHO účtu.",
  caveatEn:
    "Coming soon. LinkedIn has no self-serve access to lead forms — approval is manual and takes months. Until then, export leads from Campaign Manager as CSV; LinkedIn also deletes them after 90 days. We do not and will not offer LinkedIn inbox reading — no API exists for it, and the tools that promise it put YOUR account at risk of restriction.",
};

/** Every registered connector, in the order a picker should render them: what works
 *  today first, what is coming after. */
export const LEAD_CONNECTORS: readonly LeadConnector[] = [
  manualConnector,
  csvConnector,
  gsheetConnector,
  stub(GMAIL_META),
  stub(WHATSAPP_META),
  stub(LINKEDIN_META),
];

export function leadConnectorFor(id: string): LeadConnector | undefined {
  return LEAD_CONNECTORS.find((c) => c.meta.id === id);
}

/** Client-safe metadata for the whole registry — no functions, no secrets. */
export function leadConnectorMetas(): ConnectorMeta[] {
  return leadConnectorInfo(LEAD_CONNECTORS);
}

/** Degrade an unknown/unimplemented id to `manual` at the WRITE boundary. */
export function storableConnectorId(id: string): ConnectorId {
  return storableLeadConnectorId(id, LEAD_CONNECTORS);
}

/** The ids an ingest route may accept today. */
export function implementedConnectorIds(): ConnectorId[] {
  return LEAD_CONNECTORS.filter((c) => c.meta.implemented).map((c) => c.meta.id);
}
