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
    detail: {
      "ads-unlinked": "Platforma je nastavená, ale tento projekt nemá připojený účet Google Ads.",
      "social-demo-linkable": "Připojen jen ukázkový účet — příspěvky nikam neodejdou. Přihlaste reálný účet.",
      "social-demo-only": "Ukázkové připojení: celý tok funguje, ale bez přihlašovacích údajů poskytovatele se nepublikuje na reálnou síť.",
      "social-no-accounts": "Přihlašovací údaje jsou nastavené, žádný účet ale zatím není připojený.",
      "byom-incident": "Vlastní klíč hlásí chyby. Ověřte ho v Nastavení.",
      "byom-stale": "Vlastní klíč byl ověřen před více než 30 dny — to už není důkaz. Ověřte ho znovu.",
      "byom-unvalidated": "Vlastní klíč je uložený, ale nikdy nebyl úspěšně otestován.",
      "sklik-user-token": "Váš token je uložený a denní synchronizace je naplánovaná. Poslední úspěšný běh se zatím nikde nezaznamenává.",
      "sklik-env-token": "Běží na tokenu celé instalace (ne na vašem vlastním). Připojte svůj účet níže.",
      "sklik-none": "Bez API tokenu, ale funkční: export do CSV, návrhy klíčových slov i adaptér pro import dat. Token zapne živé napojení účtu.",
      "gbp-none": "Naimportujte Google Business Profile v modulu Mapa. Pak se recenze a pobočky propíší živě.",
      "microsite-sample": "Mikrostránka běží na ukázkové řadě — je označená a neindexuje se. Po synchronizaci dat ukáže reálná čísla.",
      "microsite-off": "Veřejná mikrostránka klienta zatím není publikovaná.",
      "leads-csv-active": "Kontakty v projektu jsou. Další dávku naimportujete na kartě Napojení.",
      "leads-csv-idle": "Funguje bez přihlašovacích údajů: vložte CSV nebo zadejte kontakt ručně. Opakovaný import stejného souboru nic nezduplikuje.",
      "leads-planned": "Připravujeme. Podmínky a omezení najdete na kartě Napojení — přečtěte si je dřív, než na tento kanál vsadíte.",
    },
    items: {
      "google-ads": "Google Ads", sklik: "Sklik", "ai-llm": "AI generování (Gemini / vlastní klíč)",
      gbp: "Google Business Profile", social: "Sociální publikování (Meta / LinkedIn)",
      "creative-images": "Generování obrázků (Leonardo)", microsite: "Klientská mikrostránka",
      "email-reports": "E-mail & reporty (Resend)", lighttrack: "LightTrack (LLM telemetrie)",
      persistence: "Datové úložiště", warehouse: "Datový sklad / feed", auth: "Přihlášení (Google OAuth)", cron: "Automatizace (cron)",
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
    detail: {
      "ads-unlinked": "The platform is configured, but this project has no Google Ads account linked.",
      "social-demo-linkable": "Only a demo account is linked — posts go nowhere. Connect a real account.",
      "social-demo-only": "Demo connection: the whole flow works, but without provider credentials nothing publishes to a real network.",
      "social-no-accounts": "Credentials are configured, but no account is linked yet.",
      "byom-incident": "Your own key is reporting failures. Re-check it in Settings.",
      "byom-stale": "Your own key was validated over 30 days ago — that is no longer evidence. Test it again.",
      "byom-unvalidated": "Your own key is stored but has never passed a test.",
      "sklik-user-token": "Your token is stored and the daily sync is scheduled. The last successful run is not recorded anywhere yet.",
      "sklik-env-token": "Running on the deployment-wide token, not your own. Connect your account below.",
      "sklik-none": "No API token, yet functional: CSV export, keyword suggestions and a data-in adapter all ship. A token turns on live account sync.",
      "gbp-none": "Import your Google Business Profile in the Map module. Reviews and locations then flow in live.",
      "microsite-sample": "The microsite runs on the sample series — disclosed and not indexed. It shows real figures once data is synced.",
      "microsite-off": "No public client microsite is published yet.",
      "leads-csv-active": "This project holds contacts. Import the next batch on the Connections tab.",
      "leads-csv-idle": "Works with no credentials at all: paste a CSV or enter a contact by hand. Re-importing the same file duplicates nothing.",
      "leads-planned": "Coming soon. The conditions and limits are on the Connections tab — read them before betting on this channel.",
    },
    items: {
      "google-ads": "Google Ads", sklik: "Sklik", "ai-llm": "AI generation (Gemini / own key)",
      gbp: "Google Business Profile", social: "Social publishing (Meta / LinkedIn)",
      "creative-images": "Image generation (Leonardo)", microsite: "Client microsite",
      "email-reports": "Email & reports (Resend)", lighttrack: "LightTrack (LLM telemetry)",
      persistence: "Data store", warehouse: "Data warehouse / feed", auth: "Sign-in (Google OAuth)", cron: "Automation (cron)",
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
