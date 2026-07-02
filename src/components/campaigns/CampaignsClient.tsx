"use client";

import { useState } from "react";
import { Bolt, Gauge, Info, Layers, Refresh, Share, Sparkles } from "@/components/icons";
import {
  CAMPAIGN_PERIODS,
  campaignPeriodLabel,
  TARGET_PNO,
  aggregate,
  type CampaignChange,
  type CampaignPeriod,
  type CampaignType,
} from "@/lib/campaigns/types";
import { useOptionalProject } from "@/lib/projects/context";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useCampaigns } from "./useCampaigns";
import TypeBreakdown from "./TypeBreakdown";
import BudgetMoves from "./BudgetMoves";
import ChangeStrip from "./ChangeStrip";
import AdsAccountPicker from "./AdsAccountPicker";
import AlertsInbox from "./AlertsInbox";
import ActivityFeed from "./ActivityFeed";
import CampaignTable, { loadFilters } from "./CampaignTable";
import HealthTimeline from "./HealthTimeline";
import PortfolioTrend from "./PortfolioTrend";
import ReportSettings from "./ReportSettings";
import ReportView from "./ReportView";
import SharedReportsList from "./SharedReportsList";
import MicrositeCard from "./MicrositeCard";
import ControlPlane from "./ControlPlane";

const T = {
  cs: {
    sourceSample: "Google Ads · ukázková data",
    sourceLive: "Google Ads · živá data",
    loading: "Načítám kampaně…",
    emptyHeading: "Zatím žádná data z Google Ads",
    emptyBody:
      "Připojte se ke Google Ads a načtěte kampaně. Bez přihlášení se použijí realistická ukázková data, abyste si prošli celý tok — porovnání podle typu i AI vyhodnocení, uložené per uživatele do Firestore.",
    syncButton: "Synchronizovat z Google Ads",
    syncing: "Synchronizuji…",
    syncShort: "Synchronizovat",
    kpiCost: "Náklady",
    kpiConvValue: "Hodnota konverzí",
    kpiPnoHint: "cíl {target} · placené portfolio",
    shareButton: "Sdílet report",
    sharing: "Vytvářím…",
    shareErr: "Sdílení se nezdařilo.",
    shareConnErr: "Nepodařilo se spojit se serverem.",
    shareLabel: "Odkaz pro klienta:",
    shareCopy: "Kopírovat",
    evalHeading: "Vyhodnocení celého portfolia",
    evalBody:
      "AI projde všechny kampaně i typy a navrhne, kam přesunout rozpočet a co optimalizovat.",
    evaluating: "Vyhodnocuji…",
    evaluate: "Vyhodnotit portfolio",
    reevaluate: "Přehodnotit portfolio",
    buildingReport: "Sestavuji hodnoticí report…",
    campaignsHeading: "Kampaně",
    campaignCount: "{n} kampaní · analýza po řádcích",
    degradedBanner:
      "Živá data z Google Ads jsou dočasně nedostupná — poslední synchronizace zobrazuje ukázková data. Zkuste synchronizovat znovu, případně obnovit připojení účtu.",
  },
  en: {
    sourceSample: "Google Ads · sample data",
    sourceLive: "Google Ads · live data",
    loading: "Loading campaigns…",
    emptyHeading: "No Google Ads data yet",
    emptyBody:
      "Connect to Google Ads to load campaigns. Without login, realistic sample data is used so you can walk through the full flow — type comparison and AI evaluation, stored per user in Firestore.",
    syncButton: "Sync from Google Ads",
    syncing: "Syncing…",
    syncShort: "Sync",
    kpiCost: "Cost",
    kpiConvValue: "Conversion value",
    kpiPnoHint: "target {target} · paid portfolio",
    shareButton: "Share report",
    sharing: "Creating…",
    shareErr: "Sharing failed.",
    shareConnErr: "Could not reach the server.",
    shareLabel: "Client link:",
    shareCopy: "Copy",
    evalHeading: "Full portfolio evaluation",
    evalBody:
      "AI reviews all campaigns and types, then suggests where to move budget and what to optimise.",
    evaluating: "Evaluating…",
    evaluate: "Evaluate portfolio",
    reevaluate: "Re-evaluate portfolio",
    buildingReport: "Building evaluation report…",
    campaignsHeading: "Campaigns",
    campaignCount: "{n} campaigns · row-by-row analysis",
    degradedBanner:
      "Live Google Ads data is temporarily unavailable — the last sync is showing sample data. Try syncing again, or reconnect the account.",
  },
} as const;

const SOURCE_KEY: Record<string, "sourceSample" | "sourceLive"> = {
  sample: "sourceSample",
  "google-ads": "sourceLive",
};

export default function CampaignsClient() {
  const project = useOptionalProject();
  const pid = project?.id;
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();
  const {
    campaigns,
    meta,
    reports,
    staleKeys,
    histories,
    changes,
    series,
    campaignSeries,
    snapshotSummaries,
    loading,
    syncing,
    error,
    analyzing,
    analyzeErrors,
    cached,
    sync,
    analyze,
  } = useCampaigns();
  // The user's explicit pick wins; otherwise mirror the synced period (so the
  // toolbar highlight matches the data on screen after a reload) and default to 30d.
  const [selected, setSelected] = useState<CampaignPeriod | null>(null);
  const period: CampaignPeriod = selected ?? meta?.period ?? "30d";

  // The table's type filter, lifted here so the TypeBreakdown cards and the
  // table dropdown drive one state (click a card → the table filters to that
  // type; click again → clear). Initialised from the same stored record the
  // table's other filters restore from, so persistence keeps working.
  const [typeFilter, setTypeFilter] = useState<CampaignType | "all">(() => loadFilters().typeFilter);
  const toggleTypeFilter = (tp: CampaignType) => setTypeFilter((cur) => (cur === tp ? "all" : tp));

  // Bumped after each sync so the alert inbox reloads (a sync can mint new alerts).
  const [alertRefresh, setAlertRefresh] = useState(0);
  const refreshAlerts = () => setAlertRefresh((n) => n + 1);
  const syncAndRefresh = (p: CampaignPeriod) => void sync(p).then(refreshAlerts);

  const changePeriod = (p: CampaignPeriod) => {
    setSelected(p);
    syncAndRefresh(p);
  };

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareErr, setShareErr] = useState<string | null>(null);
  // Bumped after a successful create so the share-management list reloads.
  const [shareRefresh, setShareRefresh] = useState(0);

  const share = async () => {
    setSharing(true);
    setShareErr(null);
    try {
      const res = await fetch("/api/campaigns/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setShareErr(json?.error ?? t("shareErr"));
        return;
      }
      setShareUrl(json.url);
      setShareRefresh((n) => n + 1);
    } catch {
      setShareErr(t("shareConnErr"));
    } finally {
      setSharing(false);
    }
  };

  const hasData = Boolean(meta) && campaigns.length > 0;
  // Index the sync-over-sync diff by campaign id so the table's triage can flag
  // ROAS craters / spend spikes vs the prior sync (empty until ≥2 syncs exist).
  const changesById: Record<string, CampaignChange> = Object.fromEntries(
    (changes?.items ?? []).filter((i) => i.kind === "changed").map((i) => [i.campaignId, i] as const)
  );
  const overall = reports["overall"];
  const overallBusy = Boolean(analyzing["overall"]);
  const overallErr = analyzeErrors["overall"];

  // ---- loading skeleton ----
  if (loading) {
    return (
      <div className="card flex items-center justify-center gap-3 p-12 text-sm text-muted">
        <Gauge width={18} height={18} className="animate-pulse text-brand-600" />
        {t("loading")}
      </div>
    );
  }

  // ---- empty state (never synced) ----
  if (!hasData) {
    return (
      <div className="card flex flex-col items-center justify-center p-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Layers width={28} height={28} />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-navy-800">{t("emptyHeading")}</h2>
        <p className="mt-2 max-w-md text-sm text-muted">{t("emptyBody")}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {CAMPAIGN_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSelected(p)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                period === p ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line text-muted hover:border-navy-200"
              }`}
            >
              {campaignPeriodLabel(p, locale)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => sync(period)}
          disabled={syncing}
          className="mt-4 inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Refresh width={17} height={17} className={syncing ? "animate-spin" : ""} />
          {syncing ? t("syncing") : t("syncButton")}
        </button>
        {error && <p className="mt-4 text-sm text-negative">{error}</p>}
      </div>
    );
  }

  const totals = aggregate(campaigns);
  const kpis = [
    { label: t("kpiCost"), value: fmt.fmtCZK(totals.cost) },
    { label: t("kpiConvValue"), value: fmt.fmtCZK(totals.conversionValue) },
    { label: "ROAS", value: fmt.fmtMultiple(totals.roas) },
    { label: "PNO", value: fmt.fmtPct(totals.pno), hint: t("kpiPnoHint", { target: fmt.fmtPct(TARGET_PNO, 0) }) },
  ];

  return (
    <div className="space-y-8">
      {/* toolbar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-pill border border-line bg-surface p-1">
            {CAMPAIGN_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => changePeriod(p)}
                disabled={syncing}
                aria-pressed={period === p}
                className={`rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                  period === p ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
                }`}
              >
                {campaignPeriodLabel(p, locale)}
              </button>
            ))}
          </div>
          {meta && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Info width={13} height={13} />
              {t(SOURCE_KEY[meta.source] ?? "sourceSample")} ·{" "}
              <time dateTime={meta.syncedAt} title={fmt.fmtDateTime(meta.syncedAt)}>
                {fmt.fmtRelative(meta.syncedAt)}
              </time>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ActivityFeed refreshKey={alertRefresh} />
          <AlertsInbox refreshKey={alertRefresh} />
          <button
            type="button"
            onClick={() => syncAndRefresh(period)}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Refresh width={16} height={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? t("syncing") : t("syncShort")}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-card border border-negative/30 bg-negative-soft px-4 py-3 text-sm text-negative">
          {error}
        </p>
      )}

      {/* truth-in-labeling: the last live sync fell back to sample data */}
      {meta?.degraded && (
        <p className="rounded-card border border-coral-400/40 bg-coral-soft px-4 py-3 text-sm text-coral-600">
          {t("degradedBanner")}
        </p>
      )}

      {/* connect a Google Ads account (live data) — sample data otherwise */}
      <AdsAccountPicker onConnected={() => sync(period)} />

      {/* portfolio KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card p-4">
            <p className="text-xs text-muted">{k.label}</p>
            <p className="tnum mt-1 text-xl font-semibold text-navy-800">{k.value}</p>
            {k.hint && <p className="mt-0.5 text-xs text-muted">{k.hint}</p>}
          </div>
        ))}
      </div>

      {/* daily portfolio trend (from the date-segmented series) */}
      {series.length >= 2 && <PortfolioTrend series={series} />}

      {/* what changed since the previous sync */}
      {changes && changes.items.length > 0 && <ChangeStrip changes={changes} />}

      <TypeBreakdown
        campaigns={campaigns}
        changesById={changesById}
        activeType={typeFilter}
        onTypeClick={toggleTypeFilter}
      />

      {/* deterministic budget-reallocation recommendations */}
      <BudgetMoves campaigns={campaigns} onApplied={() => sync(period)} />

      {/* portfolio AI evaluation */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-navy-800">
              <Sparkles width={18} height={18} className="text-brand-600" />
              {t("evalHeading")}
            </h2>
            <p className="mt-1 text-sm text-muted">{t("evalBody")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {overall && (
              <button
                type="button"
                onClick={share}
                disabled={sharing}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
              >
                <Share width={15} height={15} />
                {sharing ? t("sharing") : t("shareButton")}
              </button>
            )}
            <button
              type="button"
              onClick={() => analyze("overall", null, period)}
              disabled={overallBusy}
              className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {overallBusy ? (
                <>
                  <Gauge width={16} height={16} className="animate-pulse" />
                  {t("evaluating")}
                </>
              ) : (
                <>
                  <Bolt width={16} height={16} />
                  {overall ? t("reevaluate") : t("evaluate")}
                </>
              )}
            </button>
          </div>
        </div>

        {overallErr && <p className="mt-4 text-sm text-negative">{overallErr}</p>}
        {shareErr && <p className="mt-3 text-sm text-negative">{shareErr}</p>}
        {shareUrl && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-card bg-brand-50 px-4 py-3 text-sm">
            <span className="font-medium text-brand-800">{t("shareLabel")}</span>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link-inline tnum break-all"
            >
              {shareUrl}
            </a>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(shareUrl)}
              className="ml-auto shrink-0 rounded-pill border border-line bg-surface px-3 py-1 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300"
            >
              {t("shareCopy")}
            </button>
          </div>
        )}

        {overall && <SharedReportsList refreshSignal={shareRefresh} />}

        {overallBusy && !overall && (
          <div className="mt-5 flex items-center gap-3 text-sm text-muted">
            <Gauge width={18} height={18} className="animate-pulse text-brand-600" />
            {t("buildingReport")}
          </div>
        )}

        {overall && (
          <div className="mt-5 animate-fade-up border-t border-line pt-5">
            <ReportView
              report={overall}
              history={histories["overall"]}
              cached={cached["overall"]}
              stale={staleKeys.includes("overall")}
            />
          </div>
        )}
      </section>

      {/* white-label + scheduled client report settings */}
      <ReportSettings />

      {/* public, SEO-indexable white-label client microsite */}
      <MicrositeCard />

      {/* governed budget control plane: simulate → approve → ledger → revert */}
      <ControlPlane />

      {/* per-campaign table */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-navy-800">{t("campaignsHeading")}</h2>
          <span className="text-xs text-muted">{t("campaignCount", { n: campaigns.length })}</span>
        </div>
        {/* deterministic health timeline from stored snapshots — the rule-based
            counterpart of the AI score history, sitting next to the triage banner */}
        {snapshotSummaries.length >= 2 && (
          <div className="mb-3">
            <HealthTimeline points={snapshotSummaries} />
          </div>
        )}
        <CampaignTable
          campaigns={campaigns}
          reports={reports}
          staleKeys={staleKeys}
          histories={histories}
          analyzing={analyzing}
          analyzeErrors={analyzeErrors}
          cached={cached}
          changesById={changesById}
          onAnalyze={(id) => analyze("campaign", id, period)}
          period={period}
          campaignSeries={campaignSeries}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
        />
      </section>
    </div>
  );
}
