/** Integration status — a readiness board for the project's connectors, grouped
 *  by category, each with an honest status (connected / action / missing /
 *  manual / planned / optional) derived from the real environment + project.
 *  The "on-demand deployment" readiness view. Server component. */
import { Pill, TONE_TEXT } from "@/components/ui";
import type { PillTone } from "@/components/ui";
import { getServerLocale } from "@/lib/i18n/locale";
import { statusSummary, type IntCategory, type IntegrationRow, type IntStatus } from "@/lib/integrations/compute";
import SklikConnectCard from "@/components/campaigns/SklikConnectCard";

const COPY = {
  cs: {
    lead: "Připravenost napojení pro tento projekt — co je aktivní, co čeká na dokončení a co je zatím manuální. Odvozeno z reálné konfigurace prostředí a projektu.",
    sumConnected: "Připojeno", sumAction: "Vyžaduje akci", sumMissing: "Nenastaveno",
    sumManual: "Manuálně", sumPlanned: "Plánováno", sumOptional: "Volitelné",
    categories: { ads: "Reklama", ai: "AI", content: "Obsah", reviews: "Recenze", reports: "Reporty", infra: "Infrastruktura" },
    status: { connected: "Připojeno", action: "Vyžaduje akci", missing: "Nenastaveno", manual: "Manuálně", planned: "Plánováno", optional: "Volitelné" },
    hint: { connected: "Aktivní.", action: "Dokončete připojení účtu nebo klíče.", missing: "Nastavte přihlašovací údaje v prostředí.", manual: "Bez živého napojení — dnes manuální proces.", planned: "Na roadmapě, zatím nepropojeno.", optional: "Volitelné / vypnuto." },
    // Per-item overrides — honest, connector-specific guidance that the generic
    // status hint can't give. Keyed by item id + status.
    itemHint: {
      "sklik:manual": "Bez API tokenu, ale funkční: export do CSV, návrhy klíčových slov i adaptér pro import dat. Token zapne živé napojení účtu.",
      "gbp:action": "Naimportujte Google Business Profile v modulu Mapa — pak se recenze a pobočky propíší živě.",
    } as Record<string, string>,
    items: {
      "google-ads": "Google Ads", sklik: "Sklik", "ai-llm": "AI generování (Gemini / BYOM)",
      gbp: "Google Business Profile", social: "Sociální publikování (Meta / LinkedIn)",
      "creative-images": "Generování obrázků (Leonardo)", "email-reports": "E-mail & reporty (Resend)",
      lighttrack: "LightTrack (LLM telemetrie)", persistence: "Datové úložiště", warehouse: "Datový sklad / feed", auth: "Přihlášení (Google OAuth)", cron: "Automatizace (cron)",
    } as Record<string, string>,
    probeNote: "Zahrnuje živé ověření: platný BYOM klíč, napojený datový sklad a připojený účet Google Ads.",
  },
  en: {
    lead: "Connector readiness for this project — what's active, what's awaiting a step, and what's still manual. Derived from the real environment + project config.",
    sumConnected: "Connected", sumAction: "Needs action", sumMissing: "Not configured",
    sumManual: "Manual", sumPlanned: "Planned", sumOptional: "Optional",
    categories: { ads: "Advertising", ai: "AI", content: "Content", reviews: "Reviews", reports: "Reports", infra: "Infrastructure" },
    status: { connected: "Connected", action: "Needs action", missing: "Not configured", manual: "Manual", planned: "Planned", optional: "Optional" },
    hint: { connected: "Active.", action: "Finish linking the account or key.", missing: "Set the credentials in the environment.", manual: "No live integration — a manual process today.", planned: "On the roadmap, not wired yet.", optional: "Optional / turned off." },
    itemHint: {
      "sklik:manual": "No API token, yet functional: CSV export, keyword suggestions and a data-in adapter all ship. A token turns on live account sync.",
      "gbp:action": "Import your Google Business Profile in the Map module — reviews and locations then flow in live.",
    } as Record<string, string>,
    items: {
      "google-ads": "Google Ads", sklik: "Sklik", "ai-llm": "AI generation (Gemini / BYOM)",
      gbp: "Google Business Profile", social: "Social publishing (Meta / LinkedIn)",
      "creative-images": "Image generation (Leonardo)", "email-reports": "Email & reports (Resend)",
      lighttrack: "LightTrack (LLM telemetry)", persistence: "Data store", warehouse: "Data warehouse / feed", auth: "Sign-in (Google OAuth)", cron: "Automation (cron)",
    } as Record<string, string>,
    probeNote: "Includes live checks: a validated BYOM key, a connected data warehouse, and a linked Google Ads account.",
  },
} as const;

const TONE: Record<IntStatus, PillTone> = {
  connected: "positive",
  action: "coral",
  missing: "negative",
  manual: "neutral",
  planned: "neutral",
  optional: "neutral",
};

const CATEGORY_ORDER: IntCategory[] = ["ads", "ai", "content", "reviews", "reports", "infra"];

export default async function IntegrationStatusModule({ rows }: { rows: IntegrationRow[] }) {
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

      {/* Secondary summary — manual / planned / optional, only the non-zero ones */}
      {(summary.manual > 0 || summary.planned > 0 || summary.optional > 0) && (
        <div className="-mt-2 flex flex-wrap items-center gap-4 text-xs text-muted">
          {summary.manual > 0 && <SubSum label={c.sumManual} value={summary.manual} />}
          {summary.planned > 0 && <SubSum label={c.sumPlanned} value={summary.planned} />}
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
                      <div className="text-sm font-medium text-navy-800">{c.items[r.id] ?? r.id}</div>
                      <div className="text-xs text-muted">
                        {c.itemHint[`${r.id}:${r.status}`] ?? c.hint[r.status]}
                      </div>
                    </div>
                    <Pill tone={TONE[r.status]}>{c.status[r.status]}</Pill>
                  </li>
                ))}
              </ul>
            </div>
            {/* Sklik is now a real citizen: a live per-user connect row sits directly
                under the Advertising readiness board so the honest status pairs with
                the action that changes it. */}
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

/** A compact secondary tally (manual / planned / optional) — the softer statuses
 *  that don't warrant a full stat tile but shouldn't be hidden either. */
function SubSum({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tnum font-semibold text-navy-700">{value}</span>
      <span>{label}</span>
    </span>
  );
}
