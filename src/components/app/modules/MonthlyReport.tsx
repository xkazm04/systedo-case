"use client";

/** Měsíční report / Monthly report — a client-ready performance recap: KPI tiles
 *  grounded in the same snapshot the AI reads, plus an on-demand AI narrative.
 *  The narrative uses the `monthly-recap` op — grounded on THIS project's dataset
 *  and framed to its business type, so it fits non-eshop projects. Print +
 *  Markdown export. Account epic. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bolt, Check, Clock, Close, Document, Download, Gauge, Pin, Plus, Target, TrendDown } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { downloadText } from "@/lib/export";
import { LOCALES } from "@/lib/format";
import { resolveMoneyCompactFormatter } from "@/lib/campaigns/currency";
import { ANALYSIS_PERIODS, analysisPeriodLabel, type AnalysisPeriod, type MonthlyRecapResult } from "@/lib/ai-types";
import { useAiTool } from "@/components/ai/useAiTool";
import { deltaTone, type ReportMetric, type ReportSnap, type ReportTileSpec } from "@/lib/report/compute";
import type { MonthAttainment } from "@/lib/metrics";
import CostModelEditor, { type CostModelView } from "@/components/app/modules/CostModelEditor";
import type { BreakEven } from "@/lib/cost-model/compute";
import CompetitorEditor from "@/components/app/modules/CompetitorEditor";
import type { Competitor } from "@/lib/competitors/types";
import GoalEditor from "@/components/app/modules/GoalEditor";
import type { GoalChange } from "@/lib/metrics/goal-history";
import ReportBeyond, { type ReportBeyondData } from "@/components/app/modules/ReportBeyond";
import Modal from "@/components/app/Modal";
import type { Annotation } from "@/lib/annotations/types";
import { ANNOTATION_CAP, ANNOTATION_TEXT_MAX } from "@/lib/annotations/types";

const T = {
  cs: {
    heading: "Měsíční report", periodLabel: "Období", print: "Tisk / PDF", downloadMd: "Stáhnout .md",
    note: "Ilustrativní data klienta (stejná jako v dashboardu). AI dostává jen reálná čísla a nesmí si žádná vymýšlet.",
    liveData: "Živá data · Google Ads", syncedAt: "synchronizováno {date}",
    stale: "Data nejsou aktuální — poslední synchronizace před více než 7 dny. Synchronizujte znovu pro aktuální čísla.",
    syncCta: "Synchronizovat z Google Ads", resync: "Synchronizovat znovu", syncing: "Synchronizuji…",
    syncFailed: "Synchronizace se nezdařila.",
    unlink: "Odpojit živá data", unlinking: "Odpojuji…", unlinkFailed: "Odpojení se nezdařilo.",
    unlinkTitle: "Odpojit živá data?",
    unlinkDesc: "Report i AI souhrn se vrátí k ukázkovým datům. Napojený účet Google Ads zůstane zachovaný — data můžete kdykoli znovu synchronizovat.",
    unlinkConfirm: "Odpojit", cancel: "Zrušit",
    narrativeHeading: "Souhrn od AI", generate: "Vygenerovat souhrn", regenerate: "Vygenerovat znovu", generating: "Generuji…",
    idle: "Nech AI sestavit shrnutí výkonu za období na základě čísel výše.",
    storedOn: "Uložený souhrn z {date}", recapStale: "Neaktuální — data se od vygenerování změnila",
    recapFresh: "Odpovídá aktuálním datům", previewing: "náhled z historie",
    historyHeading: "Historie souhrnů ({n})", historyEmpty: "Zatím žádné uložené souhrny.",
    historyLatest: "nejnovější", historyStale: "neaktuální",
    error: "Souhrn se nepodařilo vygenerovat.", retry: "Zkusit znovu",
    wins: "Co se daří", risks: "Na co si dát pozor", actions: "Doporučené kroky",
    vsPrev: "vs. předchozí období",
    annHeading: "Poznámky klienta", annSub: "Co se v daném období stalo — události za čísly. Zobrazí se jako značky na časové ose a AI je zohlední v souhrnu.",
    annDate: "Datum", annText: "Co se stalo", annPlaceholder: "např. Spustili jsme TV kampaň",
    annAdd: "Přidat poznámku", annAdding: "Přidávám…", annRemove: "Odebrat",
    annEmpty: "Zatím žádné poznámky. Přidejte klíčové události (kampaně, změny na webu, PR), aby report měl paměť.",
    annFull: "Dosažen limit {cap} poznámek — nejstarší se při přidání odstraní.",
    annFailed: "Poznámku se nepodařilo uložit.", annOutOfRange: "mimo období reportu",
    annTimelineLabel: "Časová osa poznámek",
    attainmentHeading: "Plnění měsíčního cíle obratu",
    attainmentSub: "{hits} z {total} uzavřených měsíců",
    attainmentHit: "cíl splněn", attainmentMiss: "cíl nesplněn",
    pctOfGoal: "{pct} cíle",
    sampleGoalLabel: "ukázkový cíl",
  },
  en: {
    heading: "Monthly report", periodLabel: "Period", print: "Print / PDF", downloadMd: "Download .md",
    note: "Illustrative client data (the same you see in the dashboard). The AI only receives real numbers and must not invent any.",
    liveData: "Live data · Google Ads", syncedAt: "synced {date}",
    stale: "Data is out of date — last synced more than 7 days ago. Re-sync for current figures.",
    syncCta: "Sync from Google Ads", resync: "Re-sync", syncing: "Syncing…",
    syncFailed: "Sync failed.",
    unlink: "Disconnect live data", unlinking: "Disconnecting…", unlinkFailed: "Disconnect failed.",
    unlinkTitle: "Disconnect live data?",
    unlinkDesc: "The report and the AI summary revert to sample data. The linked Google Ads account stays connected — you can re-sync at any time.",
    unlinkConfirm: "Disconnect", cancel: "Cancel",
    narrativeHeading: "AI summary", generate: "Generate summary", regenerate: "Regenerate", generating: "Generating…",
    idle: "Let the AI compile a performance summary for the period based on the figures above.",
    storedOn: "Saved summary from {date}", recapStale: "Out of date — the data changed since this was generated",
    recapFresh: "Matches the current data", previewing: "history preview",
    historyHeading: "Summary history ({n})", historyEmpty: "No saved summaries yet.",
    historyLatest: "latest", historyStale: "out of date",
    error: "Could not generate the summary.", retry: "Try again",
    wins: "What’s working", risks: "Watch out for", actions: "Recommended actions",
    vsPrev: "vs. previous period",
    annHeading: "Client notes", annSub: "What happened in the period — the events behind the numbers. Shown as markers on the timeline and factored into the AI summary.",
    annDate: "Date", annText: "What happened", annPlaceholder: "e.g. Launched a TV campaign",
    annAdd: "Add note", annAdding: "Adding…", annRemove: "Remove",
    annEmpty: "No notes yet. Add key events (campaigns, site changes, PR) so the report has memory.",
    annFull: "Reached the {cap}-note limit — the oldest is dropped when you add one.",
    annFailed: "Could not save the note.", annOutOfRange: "outside the report period",
    annTimelineLabel: "Notes timeline",
    attainmentHeading: "Monthly revenue goal attainment",
    attainmentSub: "{hits} of {total} closed months",
    attainmentHit: "target met", attainmentMiss: "target missed",
    pctOfGoal: "{pct} of target",
    sampleGoalLabel: "sample goal",
  },
} as const;

/** A persisted recap for a period, with the on-load staleness verdict already
 *  decided server-side (the stored input hash vs the current inputs). Newest-first. */
export interface RecapHistoryItem {
  id: string;
  createdAt: string;
  stale: boolean;
  result: MonthlyRecapResult;
}

export default function MonthlyReport({
  tiles,
  snaps,
  attainment = [],
  projectName,
  logoUrl,
  accentColor,
  projectId,
  live = false,
  syncedAt,
  stale = false,
  customerId,
  showGoal = false,
  goal,
  goalHistory = [],
  sampleGoal = false,
  showCostModel = false,
  costModel = null,
  breakEven = null,
  catalogMarginPct = null,
  competitors = [],
  annotations = [],
  dataStart,
  dataEnd,
  beyond = null,
  currencyCode,
  recaps,
}: {
  tiles: ReportTileSpec[];
  snaps: Record<AnalysisPeriod, ReportSnap>;
  /** goal-attainment track record over the last complete months (e-shop only);
   *  a period-independent hit/miss strip beside the period tiles. Empty = hidden. */
  attainment?: MonthAttainment[];
  projectName: string;
  logoUrl?: string;
  /** R08: white-label accent band on the report header, matching the shared report */
  accentColor?: string;
  /** the project whose /metrics/sync endpoint the "sync" control hits (omit to hide it) */
  projectId?: string;
  /** true when the tiles are the client's own synced Ads data, not the sample series */
  live?: boolean;
  /** ISO timestamp of the last live sync */
  syncedAt?: string;
  /** D1: the live series is older than the staleness window (>7d) → show a warning */
  stale?: boolean;
  /** the ad account behind the live data */
  customerId?: string;
  /** Direction 2: show the revenue-goal editor (e-shop only) */
  showGoal?: boolean;
  /** Direction 2: the monthly revenue goal in force now — the real one, or the sample fallback */
  goal?: number;
  /** Direction 2: the project's saved goal-change history (for the editor) */
  goalHistory?: GoalChange[];
  /** Direction 2: true when `goal` is the illustrative sample goal (no real goal set) —
   *  the pacing/attainment surfaces then carry an honest "ukázkový cíl" label */
  sampleGoal?: boolean;
  /** A3: show the cost-model control (e-shop only) so profit reflects real margin */
  showCostModel?: boolean;
  /** the saved cost model, or null when profit is still pre-COGS contribution */
  costModel?: CostModelView | null;
  /** Direction 2: the tenant's margin-derived break-even (ROAS + PNO), shown on the
   *  cost-model strip as the target the profit line is judged against. Null → hidden. */
  breakEven?: BreakEven | null;
  /** Direction 2: the catalog's revenue-weighted blended gross margin (0–1), a
   *  one-click default for the cost-model margin field. Null → no chip shown. */
  catalogMarginPct?: number | null;
  /** C3: the project's competitor set — grounds the AI narrative "vs. the market" */
  competitors?: Competitor[];
  /** Direction 2: the project's "what happened here" annotations (newest-first) */
  annotations?: Annotation[];
  /** the report's data window (YYYY-MM-DD) — positions the annotation markers */
  dataStart?: string;
  dataEnd?: string;
  /** D1: LTV + stock/seasonality headline numbers composed into the report (e-shop) */
  beyond?: ReportBeyondData | null;
  /** the synced account's captured ISO currency (non-CZK only) — so the money tiles
   *  label a EUR/USD account in its own currency instead of hard-coded Kč. Omitted /
   *  CZK → the base compact-CZK formatting, byte-identical. */
  currencyCode?: string;
  /** Direction 1: the project's persisted recaps per period (newest-first, capped),
   *  resolved server-side so the narrative renders a stored recap on load — with its
   *  generation date and an honest stale marker — instead of regenerating every visit. */
  recaps?: Partial<Record<AnalysisPeriod, RecapHistoryItem[]>>;
}) {
  const t = useT(T);
  const { locale } = useLocale();
  const router = useRouter();
  const { fmtInt, fmtCZKCompact, fmtPct, fmtMultiple, fmtSignedPct, fmtMonth, fmtDateShort } = useFormatters();
  const [period, setPeriod] = useState<AnalysisPeriod>("30d");
  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const { status, data, run, reset } = useAiTool<MonthlyRecapResult>("monthly-recap", period);
  // Direction 1: the persisted recaps for the selected period (newest-first). The
  // narrative renders the stored recap on load; a preview lets the user page back
  // through the history. The preview lookup is scoped to the current period's
  // `history`, and the period toggle clears it — so a preview never leaks across
  // periods (no set-state-in-effect needed).
  const history = recaps?.[period] ?? [];
  const [previewId, setPreviewId] = useState<string | null>(null);

  async function syncNow() {
    if (!projectId || syncing) return;
    setSyncing(true);
    setSyncErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/metrics/sync`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) router.refresh();
      else setSyncErr(json.error || t("syncFailed"));
    } catch {
      setSyncErr(t("syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  async function unlinkNow() {
    if (!projectId || unlinking) return;
    setUnlinking(true);
    setSyncErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/metrics/sync`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setUnlinkOpen(false);
        router.refresh();
      } else {
        setSyncErr(json.error || t("unlinkFailed"));
      }
    } catch {
      setSyncErr(t("unlinkFailed"));
    } finally {
      setUnlinking(false);
    }
  }

  const en = locale === "en";
  const snap = snaps[period];
  // What the narrative shows, in precedence: an explicit history preview → a fresh
  // in-session generation (from useAiTool, incl. its localStorage restore) → the
  // newest persisted recap for this period. `shownStored` is the stored/preview
  // record when we're NOT showing a fresh session result, so its date + stale marker
  // are surfaced (a fresh generation needs neither).
  const sessionResult = data?.result;
  const preview = previewId ? history.find((h) => h.id === previewId) ?? null : null;
  const latestStored = history[0] ?? null;
  // An explicit history preview wins; else a fresh/restored in-session generation;
  // else the newest persisted recap. shownStored is the record whose date + stale
  // marker we surface (null on a fresh session result — it needs neither).
  const shownStored = preview ?? (sessionResult ? null : latestStored);
  const r = preview?.result ?? sessionResult ?? latestStored?.result ?? null;
  const activeHistoryId = preview?.id ?? (sessionResult ? null : latestStored?.id);

  const tileLabel = (spec: ReportTileSpec): string => (en ? spec.labelEn : spec.label);
  // Currency-aware compact money for the KPI tiles: a captured non-CZK account labels its
  // synced spend/revenue in its OWN currency (no conversion). CZK / unknown → fmtCZKCompact,
  // byte-identical. The amounts are already the account's native values.
  const moneyCompact = resolveMoneyCompactFormatter({
    currency: currencyCode,
    intlLocale: LOCALES[locale].intlLocale,
    base: fmtCZKCompact,
  });
  const fmtVal = (metric: ReportMetric, v: number): string => {
    const spec = tiles.find((s) => s.metric === metric);
    switch (spec?.format) {
      case "czk": return moneyCompact(v);
      case "multiple": return fmtMultiple(v);
      case "pct": return fmtPct(v);
      default: return fmtInt(v);
    }
  };
  const toneClass = (tone: string) => (tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-muted");

  function exportMd() {
    const lines = [
      `# ${t("heading")} — ${projectName}`,
      "",
      `_${analysisPeriodLabel(period, locale)}_`,
      "",
      "| " + tiles.map((s) => tileLabel(s)).join(" | ") + " |",
      "| " + tiles.map(() => "---").join(" | ") + " |",
      "| " + tiles.map((s) => fmtVal(s.metric, snap.current[s.metric] ?? 0)).join(" | ") + " |",
    ];
    if (r) {
      lines.push("", `## ${r.headline}`, "", r.summary,
        "", `### ${t("wins")}`, ...r.highlights.map((w) => `- ${w}`),
        "", `### ${t("risks")}`, ...r.watchouts.map((w) => `- ${w}`),
        "", `### ${t("actions")}`, ...r.priorities.map((a, i) => `${i + 1}. **${a.title}** — ${a.detail}`));
    }
    downloadText(`report-${period}.md`, lines.join("\n"), "text/markdown;charset=utf-8");
  }

  return (
    <div id="monthly-report" className="space-y-6">
      {/* R08: white-label accent band — matches the client-facing shared report so
          the branded header is consistent across the module, the share and print. */}
      {accentColor && (
        <div style={{ backgroundColor: accentColor }} className="-mt-1 h-1.5 w-full rounded-full" aria-hidden />
      )}
      {/* header + controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={projectName} className="h-10 w-auto max-w-[160px] object-contain" />
          )}
          <div>
            <h2 className="text-lg font-semibold text-navy-800">{projectName}</h2>
            <p className="text-sm text-muted">{t("heading")} · {analysisPeriodLabel(period, locale)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="inline-flex overflow-hidden rounded-pill border border-line">
            {ANALYSIS_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setPeriod(p); setPreviewId(null); }}
                className={"px-3 py-1.5 text-xs font-semibold transition-colors " + (period === p ? "bg-brand-500/15 text-brand-accent" : "text-muted hover:bg-brand-50")}
              >
                {analysisPeriodLabel(p, locale)}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-2 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300">
            <Document width={14} height={14} />{t("print")}
          </button>
          <button type="button" onClick={exportMd} className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-2 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300">
            <Download width={14} height={14} />{t("downloadMd")}
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((spec) => {
          const value = snap.current[spec.metric] ?? 0;
          const d = spec.hasDelta ? snap.delta[spec.metric] : undefined;
          return (
            <div key={spec.metric} className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{tileLabel(spec)}</p>
              <p className="tnum mt-1 text-2xl font-semibold text-navy-800">{fmtVal(spec.metric, value)}</p>
              {typeof d === "number" && (
                <p className={"tnum mt-0.5 text-xs font-medium " + toneClass(deltaTone(d, spec.goodWhenDown))}>
                  {fmtSignedPct(d)} <span className="text-muted">{t("vsPrev")}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Goal-attainment track record — a period-independent hit/miss strip: "did we
          hit the monthly revenue goal the last months?" beside the "this period"
          tiles above. E-shop only (revenue goal); hidden when no complete month. */}
      {attainment.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
              <Gauge width={16} height={16} className="text-brand-600" />
              {t("attainmentHeading")}
              {/* Direction 2: judged against the illustrative sample goal — say so. */}
              {sampleGoal && (
                <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                  {t("sampleGoalLabel")}
                </span>
              )}
            </div>
            <span className="text-xs text-muted">
              {t("attainmentSub", {
                hits: attainment.filter((m) => m.hit).length,
                total: attainment.length,
              })}
            </span>
          </div>
          <ul className="mt-3 flex items-end gap-3">
            {attainment.map((m) => (
              <li
                key={m.month}
                className="flex flex-col items-center gap-1"
                title={`${fmtMonth(m.month)} · ${t("pctOfGoal", {
                  pct: fmtPct(m.attainment, 0),
                })} · ${m.hit ? t("attainmentHit") : t("attainmentMiss")}`}
              >
                <span className="flex h-9 w-6 items-end overflow-hidden rounded-sm bg-navy-50">
                  <span
                    aria-hidden
                    className={`block w-full rounded-sm ${m.hit ? "bg-brand-500" : "bg-coral-500"}`}
                    style={{ height: `${Math.min(100, m.attainment * 100)}%` }}
                  />
                </span>
                <span className="text-[10px] text-muted">{fmtMonth(m.month)}</span>
                <span className="sr-only">
                  {t("pctOfGoal", { pct: fmtPct(m.attainment, 0) })} ·{" "}
                  {m.hit ? t("attainmentHit") : t("attainmentMiss")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Data source — honest about live vs illustrative, with a sync affordance. */}
      {live ? (
        <div className="space-y-2">
        <div className={"flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-xs leading-relaxed " + (stale ? "bg-coral-soft" : "bg-positive-soft")}>
          <span className={"font-medium " + (stale ? "text-coral-600" : "text-positive")}>
            <Check width={12} height={12} className="mb-0.5 mr-1 inline" />
            {t("liveData")}
            {customerId ? ` · ${customerId}` : ""}
            {syncedAt ? ` · ${t("syncedAt", { date: syncedAt.slice(0, 10) })}` : ""}
          </span>
          {projectId && (
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={syncNow}
                disabled={syncing || unlinking}
                className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
              >
                {syncing ? t("syncing") : t("resync")}
              </button>
              <button
                type="button"
                onClick={() => { setSyncErr(null); setUnlinkOpen(true); }}
                disabled={syncing || unlinking}
                className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-muted transition-colors hover:border-coral-400 hover:text-coral-600 disabled:opacity-50"
              >
                {t("unlink")}
              </button>
            </div>
          )}
        </div>
        {/* D1: stale-data warning — the live series is >7 days old. */}
        {stale && (
          <p className="rounded-lg bg-coral-soft px-4 py-2.5 text-xs font-medium leading-relaxed text-coral-600">
            {t("stale")}
          </p>
        )}
        {syncErr && !unlinkOpen && <p className="text-xs text-negative">{syncErr}</p>}
        </div>
      ) : (
        <div className="rounded-lg bg-canvas px-4 py-3 text-xs leading-relaxed text-muted">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("note")}</span>
            {projectId && (
              <button
                type="button"
                onClick={syncNow}
                disabled={syncing}
                className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50 print:hidden"
              >
                {syncing ? t("syncing") : t("syncCta")}
              </button>
            )}
          </div>
          {syncErr && <p className="mt-2 text-negative">{syncErr}</p>}
        </div>
      )}

      {/* Unlink confirm — reverts the report + recap to sample data. Shared Modal. */}
      <Modal
        open={unlinkOpen}
        onClose={() => !unlinking && setUnlinkOpen(false)}
        title={t("unlinkTitle")}
        footer={
          <div className="flex items-center justify-end gap-2">
            {syncErr && <p className="mr-auto text-xs text-negative">{syncErr}</p>}
            <button
              type="button"
              onClick={() => setUnlinkOpen(false)}
              disabled={unlinking}
              className="rounded-pill border border-line bg-surface px-4 py-2 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={unlinkNow}
              disabled={unlinking}
              className="rounded-pill bg-coral-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-coral-500 disabled:opacity-50"
            >
              {unlinking ? t("unlinking") : t("unlinkConfirm")}
            </button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-navy-700">{t("unlinkDesc")}</p>
      </Modal>

      {/* Direction 2: the real monthly revenue goal — the target pacing/attainment
          judge against (e-shop). Replaces the illustrative "ukázkový cíl". */}
      {showGoal && projectId && typeof goal === "number" && (
        <GoalEditor projectId={projectId} goal={goal} sampleGoal={sampleGoal} history={goalHistory} />
      )}

      {/* A3: cost model — true net profit after COGS + overhead (e-shop). */}
      {showCostModel && projectId && <CostModelEditor projectId={projectId} model={costModel} breakEven={breakEven} catalogMarginPct={catalogMarginPct} />}

      {/* C3: competitor set — grounds the AI narrative "vs. the market". */}
      {projectId && <CompetitorEditor projectId={projectId} initial={competitors} />}

      {/* Direction 2: "what happened here" — client notes as chart markers + recap grounding. */}
      {projectId && (
        <AnnotationsPanel
          projectId={projectId}
          initial={annotations}
          dataStart={dataStart}
          dataEnd={dataEnd}
        />
      )}

      {/* AI narrative */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-navy-800">{t("narrativeHeading")}</h3>
          <button
            type="button"
            onClick={() => { if (status !== "loading") { setPreviewId(null); run({ period }); } }}
            disabled={status === "loading"}
            className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 print:hidden"
          >
            {status === "loading" ? <Gauge width={16} height={16} className="animate-pulse" /> : <Bolt width={16} height={16} />}
            {status === "loading" ? t("generating") : r ? t("regenerate") : t("generate")}
          </button>
        </div>

        {status !== "loading" && status !== "error" && !r && <p className="mt-4 text-sm text-muted">{t("idle")}</p>}
        {status === "loading" && <div className="mt-4 h-24 animate-pulse rounded-card bg-canvas" />}
        {status === "error" && (
          <div className="mt-4 text-sm">
            <p className="text-negative">{t("error")}</p>
            <button type="button" onClick={reset} className="mt-2 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 hover:border-brand-300">{t("retry")}</button>
          </div>
        )}
        {status !== "loading" && status !== "error" && r && (
          <div className="animate-fade-up mt-4 space-y-5">
            {/* Direction 1: when the shown recap is a stored record (not a fresh
                in-session generation), surface its generation date and an honest
                stale marker (the current data no longer matches the stored one). */}
            {shownStored && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 text-muted">
                  <Clock width={12} height={12} />
                  {t("storedOn", { date: fmtDateShort(shownStored.createdAt.slice(0, 10)) })}
                </span>
                {shownStored.stale ? (
                  <span className="rounded-pill bg-coral-soft px-2 py-0.5 font-medium text-coral-600">{t("recapStale")}</span>
                ) : (
                  <span className="rounded-pill bg-positive-soft px-2 py-0.5 font-medium text-positive">{t("recapFresh")}</span>
                )}
                {preview && <span className="text-muted">· {t("previewing")}</span>}
              </div>
            )}
            <div className="rounded-card border border-navy-200 bg-navy-50 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400"><Target width={18} height={18} /></span>
                <div>
                  <p className="font-semibold text-navy-800">{r.headline}</p>
                  <p className="mt-2 text-sm leading-relaxed text-navy-700">{r.summary}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {r.highlights.length > 0 && (
                <Group title={t("wins")}>
                  {r.highlights.map((w, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-positive-soft text-positive"><Check width={12} height={12} /></span>
                      <span className="leading-snug">{w}</span>
                    </li>
                  ))}
                </Group>
              )}
              {r.watchouts.length > 0 && (
                <Group title={t("risks")}>
                  {r.watchouts.map((w, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-coral-soft text-coral-600"><TrendDown width={12} height={12} /></span>
                      <span className="leading-snug">{w}</span>
                    </li>
                  ))}
                </Group>
              )}
            </div>
            {r.priorities.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-navy-800">{t("actions")}</p>
                <ol className="space-y-2.5">
                  {r.priorities.map((a, i) => (
                    <li key={i} className="flex gap-3 rounded-card border border-line bg-surface p-4">
                      <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-navy-800">{a.title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-navy-600">{a.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Direction 1: capped history (last 6 per period) in a small disclosure —
                page back through the stored recaps; each row shows its date, headline
                and a stale badge. Interactive, so hidden in print. */}
            {history.length > 0 && (
              <details className="group border-t border-line pt-4 print:hidden">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-navy-700">
                  <Clock width={13} height={13} />
                  {t("historyHeading", { n: history.length })}
                </summary>
                <ul className="mt-3 space-y-1.5">
                  {history.map((h, i) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => setPreviewId(h.id)}
                        className={
                          "flex w-full items-center gap-2.5 rounded-card border px-3 py-2 text-left text-xs transition-colors " +
                          (activeHistoryId === h.id ? "border-brand-300 bg-brand-50" : "border-line bg-surface hover:border-brand-300")
                        }
                      >
                        <span className="tnum shrink-0 font-semibold text-navy-700">{fmtDateShort(h.createdAt.slice(0, 10))}</span>
                        <span className="flex-1 truncate text-navy-600">{h.result.headline}</span>
                        {i === 0 && <span className="shrink-0 rounded-pill bg-canvas px-1.5 py-0.5 font-medium text-muted">{t("historyLatest")}</span>}
                        {h.stale && <span className="shrink-0 rounded-pill bg-coral-soft px-1.5 py-0.5 font-medium text-coral-600">{t("historyStale")}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* D1: compose the LTV + stock/seasonality spines into the report (e-shop). */}
      {beyond && projectId && <ReportBeyond projectId={projectId} data={beyond} />}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-navy-800">{title}</p>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

/** 0–100 % position of a YYYY-MM-DD date across the [start, end] window, or null when
 *  the date is outside the window (so an out-of-range note isn't drawn off the axis).
 *  Pure; string dates parse as UTC midnight so the ratio is stable across timezones. */
function datePct(date: string, start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  const d = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || Number.isNaN(d) || e <= s) return null;
  if (d < s || d > e) return null;
  return ((d - s) / (e - s)) * 100;
}

/** Inline "what happened here" notes on the monthly report: a compact timeline that
 *  renders each note as a marker over the report's data window (the chart markers),
 *  plus an add form and per-note remove. CRUD hits the ownership-checked
 *  /annotations sub-resource; the live dataset separately maps these into the recap
 *  grounding + PerformanceData event shape server-side. */
function AnnotationsPanel({
  projectId,
  initial,
  dataStart,
  dataEnd,
}: {
  projectId: string;
  initial: Annotation[];
  dataStart?: string;
  dataEnd?: string;
}) {
  const t = useT(T);
  const { fmtDateShort } = useFormatters();
  const [items, setItems] = useState<Annotation[]>(initial);
  const [date, setDate] = useState<string>(dataEnd ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const full = items.length >= ANNOTATION_CAP;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !date || !text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, text: text.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: Annotation[]; error?: string };
      if (res.ok && json.ok && json.items) {
        setItems(json.items);
        setText("");
      } else {
        setErr(json.error || t("annFailed"));
      }
    } catch {
      setErr(t("annFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    // Optimistic: drop locally, restore on failure.
    const prev = items;
    setItems((xs) => xs.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/projects/${projectId}/annotations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        setItems(prev);
        setErr(t("annFailed"));
      }
    } catch {
      setItems(prev);
      setErr(t("annFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Notes newest-first for the list; the timeline positions each by its own date.
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-accent">
          <Pin width={15} height={15} />
        </span>
        <h3 className="text-base font-semibold text-navy-800">{t("annHeading")}</h3>
      </div>
      <p className="mt-1.5 text-sm text-muted">{t("annSub")}</p>

      {/* Timeline — markers over the report's data window. */}
      {dataStart && dataEnd && (
        <div
          className="relative mt-4 h-12"
          role="img"
          aria-label={t("annTimelineLabel")}
        >
          <div className="absolute inset-x-0 top-6 h-px bg-line" />
          <span className="absolute left-0 top-8 text-[10px] text-muted">{fmtDateShort(dataStart)}</span>
          <span className="absolute right-0 top-8 text-[10px] text-muted">{fmtDateShort(dataEnd)}</span>
          {items.map((a) => {
            const p = datePct(a.date, dataStart, dataEnd);
            if (p === null) return null;
            return (
              <span
                key={a.id}
                className="absolute top-6 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p}%` }}
                title={`${a.date} · ${a.text}`}
              >
                <span className="block h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand-600 shadow-sm" />
              </span>
            );
          })}
        </div>
      )}

      {/* Add form. */}
      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2 print:hidden">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">{t("annDate")}</span>
          <input
            type="date"
            value={date}
            min={dataStart}
            max={dataEnd}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-pill border border-line bg-surface px-3 py-1.5 text-sm text-navy-800"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1" style={{ minWidth: 180 }}>
          <span className="text-xs font-medium text-muted">{t("annText")}</span>
          <input
            type="text"
            value={text}
            maxLength={ANNOTATION_TEXT_MAX}
            placeholder={t("annPlaceholder")}
            onChange={(e) => setText(e.target.value)}
            className="rounded-pill border border-line bg-surface px-3 py-1.5 text-sm text-navy-800"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !date || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus width={14} height={14} />
          {busy ? t("annAdding") : t("annAdd")}
        </button>
      </form>
      {full && <p className="mt-2 text-xs text-muted">{t("annFull", { cap: String(ANNOTATION_CAP) })}</p>}
      {err && <p className="mt-2 text-xs text-negative">{err}</p>}

      {/* List. */}
      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("annEmpty")}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {sorted.map((a) => {
            const inRange = datePct(a.date, dataStart, dataEnd) !== null;
            return (
              <li key={a.id} className="flex items-start gap-3 rounded-card border border-line bg-surface p-3">
                <span className="tnum mt-0.5 shrink-0 rounded-pill bg-canvas px-2 py-0.5 text-xs font-semibold text-navy-700">
                  {fmtDateShort(a.date)}
                </span>
                <span className="flex-1 text-sm leading-snug text-navy-700">
                  {a.text}
                  {!inRange && <span className="ml-1.5 text-xs text-muted">· {t("annOutOfRange")}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  disabled={busy}
                  aria-label={t("annRemove")}
                  title={t("annRemove")}
                  className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-coral-soft hover:text-coral-600 disabled:opacity-50 print:hidden"
                >
                  <Close width={14} height={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
