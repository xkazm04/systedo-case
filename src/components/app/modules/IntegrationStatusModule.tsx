/** Integration status — a readiness board for the project's connectors, grouped by
 *  category, each with an honest status (connected / action / missing / manual /
 *  optional) derived from the real environment AND live health probes. Every hint
 *  that names a next step links to the control that performs it. Server component.
 *
 *  The copy tables are typed against the compute module's closed unions
 *  (IntItemId / IntDetail / IntStatus), so adding a connector or a nuance fails
 *  `typecheck` here instead of shipping a raw slug to a user — the posture
 *  project-data/source.ts argues for. */
import Link from "next/link";
import { Pill, TONE_TEXT } from "@/components/ui";
import type { PillTone } from "@/components/ui";
import { getServerLocale } from "@/lib/i18n/locale";
import type { SupportedLocale } from "@/lib/format";
import {
  statusSummary,
  type IntCategory,
  type IntDetail,
  type IntItemId,
  type IntLink,
  type IntegrationRow,
  type IntStatus,
} from "@/lib/integrations/compute";
import SklikConnectCard from "@/components/campaigns/SklikConnectCard";
import { DETAIL_COPY } from "./IntegrationStatusDetailCopy";

interface Copy {
  lead: string;
  sumConnected: string; sumAction: string; sumMissing: string;
  sumManual: string; sumOptional: string;
  open: string;
  categories: Record<IntCategory, string>;
  status: Record<IntStatus, string>;
  hint: Record<IntStatus, string>;
  detail: Record<IntDetail, string>;
  items: Record<IntItemId, string>;
  probeNote: string;
}

const COPY: Record<SupportedLocale, Copy> = {
  cs: {
    lead: "Připravenost napojení pro tento projekt: co je aktivní, co čeká na dokončení a co je zatím manuální. Odvozeno z reálné konfigurace prostředí a ze živého stavu vašich připojení.",
    sumConnected: "Připojeno", sumAction: "Vyžaduje akci", sumMissing: "Nenastaveno",
    sumManual: "Manuálně", sumOptional: "Volitelné",
    open: "Otevřít",
    categories: { ads: "Reklama", ai: "AI", content: "Obsah", leads: "Leady", reviews: "Recenze", reports: "Reporty", infra: "Infrastruktura" },
    status: { connected: "Připojeno", action: "Vyžaduje akci", missing: "Nenastaveno", manual: "Manuálně", optional: "Volitelné" },
    hint: { connected: "Aktivní.", action: "Dokončete připojení účtu nebo klíče.", missing: "Nastavte přihlašovací údaje v prostředí.", manual: "Bez živého napojení, dnes manuální proces.", optional: "Volitelné / vypnuto." },
    detail: DETAIL_COPY.cs,
    items: {
      "google-ads": "Google Ads", sklik: "Sklik", "ai-llm": "AI generování (Gemini / vlastní klíč)",
      gbp: "Google Business Profile", social: "Sociální publikování (Meta / LinkedIn)",
      "creative-images": "Generování obrázků (Leonardo)", microsite: "Klientská mikrostránka",
      "email-reports": "E-mail & reporty (Resend)", lighttrack: "LightTrack (LLM telemetrie)",
      persistence: "Datové úložiště", warehouse: "Datový sklad / feed", webhooks: "Odchozí webhooky (projekt)",
      auth: "Přihlášení (Google OAuth)", cron: "Automatizace (cron)",
      "twin-inbound": "Příjem zpráv do Schránky",
      "leads-csv": "CSV / ruční zadání", "leads-gsheet": "Google Sheets", "leads-gmail": "Gmail",
      "leads-whatsapp": "WhatsApp", "leads-linkedin": "LinkedIn Lead Sync",
    },
    probeNote: "Zahrnuje živé ověření: zdraví vlastního AI klíče (včetně stáří ověření), připojené sociální účty (ukázkové vs. reálné), váš Sklik token, datový sklad, účet Google Ads a publikovanou mikrostránku.",
  },
  en: {
    lead: "Connector readiness for this project: what's active, what's awaiting a step, and what's still manual. Derived from the real environment config and the live health of your connections.",
    sumConnected: "Connected", sumAction: "Needs action", sumMissing: "Not configured",
    sumManual: "Manual", sumOptional: "Optional",
    open: "Open",
    categories: { ads: "Advertising", ai: "AI", content: "Content", leads: "Leads", reviews: "Reviews", reports: "Reports", infra: "Infrastructure" },
    status: { connected: "Connected", action: "Needs action", missing: "Not configured", manual: "Manual", optional: "Optional" },
    hint: { connected: "Active.", action: "Finish linking the account or key.", missing: "Set the credentials in the environment.", manual: "No live integration, a manual process today.", optional: "Optional / turned off." },
    detail: DETAIL_COPY.en,
    items: {
      "google-ads": "Google Ads", sklik: "Sklik", "ai-llm": "AI generation (Gemini / own key)",
      gbp: "Google Business Profile", social: "Social publishing (Meta / LinkedIn)",
      "creative-images": "Image generation (Leonardo)", microsite: "Client microsite",
      "email-reports": "Email & reports (Resend)", lighttrack: "LightTrack (LLM telemetry)",
      persistence: "Data store", warehouse: "Data warehouse / feed", webhooks: "Outgoing webhooks (project)",
      auth: "Sign-in (Google OAuth)", cron: "Automation (cron)",
      "twin-inbound": "Message intake into the Inbox",
      "leads-csv": "CSV / manual entry", "leads-gsheet": "Google Sheets", "leads-gmail": "Gmail",
      "leads-whatsapp": "WhatsApp", "leads-linkedin": "LinkedIn Lead Sync",
    },
    probeNote: "Includes live checks: your own AI key's health (validation age included), linked social accounts (demo vs real), your Sklik token, the data warehouse, the Google Ads account, and a published microsite.",
  },
};

const TONE: Record<IntStatus, PillTone> = {
  connected: "positive",
  action: "coral",
  missing: "negative",
  manual: "neutral",
  optional: "neutral",
};

/** Row link → the in-app control that changes the row. `home` is the project
 *  overview (where the Ads account is connected). */
const LINK_PATH: Record<IntLink, string> = {
  home: "", socialni: "/socialni", mapa: "/mapa", branding: "/branding", nastaveni: "/nastaveni",
  // The lead-connector rows' action lives on this module's own second tab.
  "leads-connect": "/integrace?tab=napojeni",
  // WP W3-D: the intake address is minted where the messages it accepts arrive.
  schranka: "/schranka",
};

const CATEGORY_ORDER: IntCategory[] = ["ads", "ai", "content", "leads", "reviews", "reports", "infra"];

export default async function IntegrationStatusModule({
  rows,
  projectId,
}: {
  rows: IntegrationRow[];
  projectId: string;
}) {
  const locale = await getServerLocale();
  const c = COPY[locale] ?? COPY.cs;
  const summary = statusSummary(rows);
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    rows: rows.filter((r) => r.category === cat),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="stagger space-y-6">
      <p className="max-w-2xl text-sm leading-relaxed text-muted">{c.lead}</p>

      {/* Summary */}
      <div className="flex flex-wrap items-center gap-6">
        <Sum label={c.sumConnected} value={summary.connected} tone="positive" />
        <Sum label={c.sumAction} value={summary.action} tone="coral" />
        <Sum label={c.sumMissing} value={summary.missing} tone="negative" />
      </div>

      {/* Secondary summary — manual / optional, only the non-zero ones */}
      {(summary.manual > 0 || summary.optional > 0) && (
        <div className="-mt-2 flex flex-wrap items-center gap-4 text-xs text-muted">
          {summary.manual > 0 && <SubSum label={c.sumManual} value={summary.manual} />}
          {summary.optional > 0 && <SubSum label={c.sumOptional} value={summary.optional} />}
        </div>
      )}

      {/* Readiness by category */}
      <div className="space-y-6">
        {byCategory.map((g) => (
          <div key={g.cat}>
            <div className="card overflow-hidden">
              <h3 className="border-b border-line px-5 py-3 text-sm font-semibold text-navy-800">
                {c.categories[g.cat]}
              </h3>
              <ul className="divide-y divide-line">
                {g.rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-navy-800">{c.items[r.id]}</div>
                      <div className="text-xs text-muted">
                        {r.detail ? c.detail[r.detail] : c.hint[r.status]}
                        {r.link !== undefined && (
                          <>
                            {" "}
                            <Link
                              href={`/app/${projectId}${LINK_PATH[r.link]}`}
                              className="font-medium text-brand-accent underline-offset-2 hover:underline"
                            >
                              {c.open} →
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                    <Pill tone={TONE[r.status]}>{c.status[r.status]}</Pill>
                  </li>
                ))}
              </ul>
            </div>
            {/* Sklik is a real citizen: a live per-user connect row sits directly
                under the Advertising readiness board so the honest status pairs with
                the action that changes it — and the row above now reads the SAME
                per-user record this card writes. */}
            {g.cat === "ads" && (
              <div className="mt-4">
                <SklikConnectCard />
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted">{c.probeNote}</p>
    </div>
  );
}

function Sum({ label, value, tone }: { label: string; value: number; tone: "positive" | "coral" | "negative" }) {
  const color = TONE_TEXT[tone];
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={"tnum mt-1 text-2xl font-semibold " + color}>{value}</p>
    </div>
  );
}

/** A compact secondary tally (manual / optional) — the softer statuses that don't
 *  warrant a full stat tile but shouldn't be hidden either. */
function SubSum({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tnum font-semibold text-navy-700">{value}</span>
      <span>{label}</span>
    </span>
  );
}
