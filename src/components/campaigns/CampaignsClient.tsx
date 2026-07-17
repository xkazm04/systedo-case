"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { Bolt, Gauge, Layers, Refresh, Share, Sparkles } from "@/components/icons";
import { Button } from "@/components/ui";
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
import type { BreakEven } from "@/lib/cost-model/compute";
import type { TriageGoals } from "@/lib/campaigns/triage";
import type { AlertRecord } from "@/lib/campaigns/alerts";
import { alertStatus, alertCampaignIds } from "@/lib/campaigns/alert-suppression";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAsyncAction } from "@/components/hooks/useAsyncAction";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import { useCampaigns } from "./useCampaigns";
import { useCampaignErrorText } from "./errors";
import { revealThreadTarget, THREAD_ANCHORS } from "./thread";
import TypeBreakdown from "./TypeBreakdown";
import ChangeStrip from "./ChangeStrip";
import AdsAccountPicker from "./AdsAccountPicker";
import AlertsInbox from "./AlertsInbox";
import ActivityFeed from "./ActivityFeed";
import CampaignTable from "./CampaignTable";
import PillButton from "./PillButton";
import { loadFilters } from "./table/filters";
import HealthTimeline from "./HealthTimeline";
import ReportView from "./ReportView";
import SyncProvenance from "./SyncProvenance";
import { LOCALES } from "@/lib/format";
import { resolveMoneyFormatter, resolveSignedMoneyFormatter } from "@/lib/campaigns/currency";

// Below-fold, heavy panels — code-split so their JS loads after the above-fold
// triage view (toolbar, account picker, campaign table) rather than in this
// page's initial bundle, mirroring the repo's next/dynamic + SectionSkeleton
// convention (see ContentEngine). ReportView stays eager: the eager CampaignTable
// already imports it for per-row reports, so a dynamic wrapper here would add a
// skeleton flash for zero bundle win.
const BudgetMoves = dynamic(() => import("./BudgetMoves"), {
  loading: () => <SectionSkeleton height="h-80" />,
});
const SharedReportsList = dynamic(() => import("./SharedReportsList"), {
  loading: () => <SectionSkeleton height="h-32" lines={2} />,
});
const ReportSettings = dynamic(() => import("./ReportSettings"), {
  loading: () => <SectionSkeleton height="h-80" />,
});
const MicrositeCard = dynamic(() => import("./MicrositeCard"), {
  loading: () => <SectionSkeleton height="h-64" />,
});
const ControlPlane = dynamic(() => import("./ControlPlane"), {
  loading: () => <SectionSkeleton height="h-48" lines={2} />,
});

const T = {
  cs: {
    sourceSample: "Google Ads · ukázková data",
    sourceLive: "Google Ads · živá data",
    sourceSklik: "Sklik · živá data",
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
    breakEvenNote: "Váš break-even ROAS podle marže je {roas} (PNO {pno}) — pod ním kampaň po odečtení nákladů zboží prodělává.",
    breakEvenLoaded: "s režií {roas}",
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
    evalAll: "Vyhodnotit vše",
    evalAllBusy: "Vyhodnocuji vše…",
    evalAllTitle:
      "Projde portfolio i všechny kampaně najednou; platí se jen za reporty, u kterých se data od posledního vyhodnocení změnila",
    evalAllSummary: "Hromadné vyhodnocení: {fresh} nových reportů, {cached} beze změny (z cache).",
    evalAllQuota: "Denní limit AI vyhodnocení vyčerpán — na {n} nezbylo.",
    buildingReport: "Sestavuji hodnoticí report…",
    campaignsHeading: "Kampaně",
    campaignCount: "{n} kampaní · analýza po řádcích",
    govHeading: "Řízení rozpočtů",
    degradedBanner:
      "Živá data z Google Ads jsou dočasně nedostupná — poslední synchronizace zobrazuje ukázková data. Zkuste synchronizovat znovu, případně obnovit připojení účtu.",
  },
  en: {
    sourceSample: "Google Ads · sample data",
    sourceLive: "Google Ads · live data",
    sourceSklik: "Sklik · live data",
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
    breakEvenNote: "Your margin-based break-even ROAS is {roas} (COS {pno}) — below it a campaign loses money once cost of goods is subtracted.",
    breakEvenLoaded: "with overhead {roas}",
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
    evalAll: "Evaluate everything",
    evalAllBusy: "Evaluating everything…",
    evalAllTitle:
      "Walks the portfolio and every campaign in one go; only reports whose data changed since the last evaluation are paid for",
    evalAllSummary: "Batch evaluation: {fresh} new reports, {cached} unchanged (from cache).",
    evalAllQuota: "Daily AI evaluation quota exhausted — {n} left unevaluated.",
    buildingReport: "Building evaluation report…",
    campaignsHeading: "Campaigns",
    campaignCount: "{n} campaigns · row-by-row analysis",
    govHeading: "Budget management",
    degradedBanner:
      "Live Google Ads data is temporarily unavailable — the last sync is showing sample data. Try syncing again, or reconnect the account.",
  },
} as const;

const SOURCE_KEY: Record<string, "sourceSample" | "sourceLive" | "sourceSklik"> = {
  sample: "sourceSample",
  "google-ads": "sourceLive",
  sklik: "sourceSklik",
};

export default function CampaignsClient({
  breakEven = null,
  marginPct = null,
  goals = null,
}: {
  breakEven?: BreakEven | null;
  /** Direction 1: the tenant's persisted blended margin (0..1), threaded to the
   *  BudgetMoves preview so it scores/scales in profit. Null → margin-blind. */
  marginPct?: number | null;
  /** Triage against the tenant's own goal: the agreed pnoGoal → target ROAS/PNO
   *  (plus the margin-based break-even when a cost model exists), so the badges,
   *  cell tones and banner all measure against the SAME per-tenant target. Null →
   *  the module constants (default / unseeded tenant → byte-identical). */
  goals?: TriageGoals | null;
} = {}) {
  const project = useOptionalProject();
  const pid = project?.id;
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();
  // Resolves the hook's CampaignError (a client key or a raw server message) to a
  // localized string at render — the hook itself can't call useT.
  const errText = useCampaignErrorText();
  const {
    campaigns,
    meta,
    reports,
    staleKeys,
    histories,
    changes,
    campaignSeries,
    snapshotSummaries,
    loading,
    syncing,
    error,
    analyzing,
    analyzeErrors,
    cached,
    analyzingAll,
    batchSummary,
    sync,
    analyze,
    analyzeAll,
  } = useCampaigns();
  // Batch evaluation is signed-in only (the route 401s for the shared sample
  // tenant), so anonymous visitors don't see a button that can't work.
  const { status: sessionStatus } = useSession();
  const authed = sessionStatus === "authenticated";
  // Portal host for the header badges (rendered into ModulePage's header slot,
  // opposite the title). Resolved after mount so the target div exists in the DOM.
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // Resolve the portal target once the header is committed to the DOM.
    const resolveHost = () => setHeaderHost(document.getElementById("module-header-actions"));
    resolveHost();
  }, []);
  // The user's explicit pick wins; otherwise mirror the synced period (so the
  // toolbar highlight matches the data on screen after a reload) and default to 30d.
  const [selected, setSelected] = useState<CampaignPeriod | null>(null);
  const period: CampaignPeriod = selected ?? meta?.period ?? "30d";

  // Currency-aware money formatter for the synced surfaces (Direction 2). For a
  // CZK / unknown / un-captured account this IS fmt.fmtCZK (byte-identical); a
  // captured non-CZK account (a EUR/PLN Google Ads account) relabels the amount in
  // its own currency — we relabel, never convert. Used for the money KPIs + handed
  // to the table so a foreign account never reads its euros as koruny.
  const fmtMoney = resolveMoneyFormatter({
    currency: meta?.currency,
    intlLocale: LOCALES[locale].intlLocale,
    base: fmt.fmtCZK,
  });
  // The SIGNED counterpart for money deltas (projected gain/saving/profit, change strip),
  // so a foreign account no longer sees koruny on the signed figures next to a euro-
  // labelled amount. Byte-identical to fmt.fmtSignedCZK for CZK/unknown accounts.
  const fmtMoneySigned = resolveSignedMoneyFormatter({
    currency: meta?.currency,
    intlLocale: LOCALES[locale].intlLocale,
    base: fmt.fmtSignedCZK,
  });

  // The table's type filter, lifted here so the TypeBreakdown cards and the
  // table dropdown drive one state (click a card → the table filters to that
  // type; click again → clear). Initialised from the same stored record the
  // table's other filters restore from, so persistence keeps working.
  const [typeFilter, setTypeFilter] = useState<CampaignType | "all">(() => loadFilters().typeFilter);
  const toggleTypeFilter = (tp: CampaignType) => setTypeFilter((cur) => (cur === tp ? "all" : tp));

  // Bumped after each sync so the alert inbox reloads (a sync can mint new alerts).
  const [alertRefresh, setAlertRefresh] = useState(0);
  const refreshAlerts = () => setAlertRefresh((n) => n + 1);

  // Bumped when the BudgetMoves panel proposes a change-set, so the governed
  // control plane below reloads and surfaces the pending proposal for approval.
  const [controlPlaneRefresh, setControlPlaneRefresh] = useState(0);
  const syncAndRefresh = (p: CampaignPeriod) => void sync(p).then(refreshAlerts);

  // Map campaign id → the id of a stageable critical alert naming it. A critical
  // table row uses this to stage a change-set pre-scoped to that campaign's alert
  // — the fully-scoped path the control-plane route supports. Direction 2: the
  // alerts come from AlertsInbox (the single /api/alerts owner, reporting via
  // onAlertsChange) instead of a second fetch of the same endpoint — so one sync
  // triggers one alerts request, not two. The map is derived from that list.
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const alertByCampaign = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of alerts) {
      // Mirrors AlertsInbox's canStage: a critical, not-yet-resolved alert that
      // names campaigns can seed a scoped change-set.
      if (a.type !== "critical" || alertStatus(a) === "resolved") continue;
      for (const cid of alertCampaignIds(a)) if (!map.has(cid)) map.set(cid, a.id);
    }
    return map;
  }, [alerts]);

  // Stage a change-set for one critical row: prefer the campaign's own alert (the
  // route's fully-scoped path); otherwise fall back to a campaign-scoped create.
  // On success, reload the control plane + alerts and reveal the new proposal.
  const preparePackage = async (campaignId: string): Promise<boolean> => {
    const alertId = alertByCampaign.get(campaignId);
    try {
      const res = await fetch("/api/campaigns/control-plane", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          alertId
            ? { action: "create", alertId, projectId: pid }
            : { action: "create", scopeCampaignIds: [campaignId], projectId: pid }
        ),
      });
      if (!res.ok) return false;
      setControlPlaneRefresh((n) => n + 1);
      refreshAlerts();
      revealThreadTarget(THREAD_ANCHORS.controlPlane);
      return true;
    } catch {
      return false;
    }
  };

  const changePeriod = (p: CampaignPeriod) => {
    setSelected(p);
    // Period toggle prefers the period's stored state (instant + quota-free);
    // only a never-synced period falls through to a real connector sync. The
    // explicit "Synchronizovat" button stays a forced refresh.
    void sync(p, { preferStored: true }).then(refreshAlerts);
  };

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const { busy: sharing, error: shareErr, setError: setShareErr, run: runShare } = useAsyncAction();
  // Bumped after a successful create so the share-management list reloads.
  const [shareRefresh, setShareRefresh] = useState(0);

  const share = () =>
    runShare(
      async () => {
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
      },
      { serverError: t("shareConnErr") }
    );

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
        <PillButton size="lg" press onClick={() => sync(period)} disabled={syncing} className="mt-4">
          <Refresh width={17} height={17} className={syncing ? "animate-spin" : ""} />
          {syncing ? t("syncing") : t("syncButton")}
        </PillButton>
        {error && <p className="mt-4 text-sm text-negative">{errText(error)}</p>}
      </div>
    );
  }

  const totals = aggregate(campaigns);
  const kpis = [
    { label: t("kpiCost"), value: fmtMoney(totals.cost) },
    { label: t("kpiConvValue"), value: fmtMoney(totals.conversionValue) },
    { label: "ROAS", value: fmt.fmtMultiple(totals.roas) },
    { label: "PNO", value: fmt.fmtPct(totals.pno), hint: t("kpiPnoHint", { target: fmt.fmtPct(TARGET_PNO, 0) }) },
  ];

  return (
    <div className="stagger space-y-8">
      {/* Portfolio KPIs, minimized to badges in the page header (opposite the
          title) via a portal into ModulePage's header slot. */}
      {headerHost &&
        createPortal(
          <>
            {kpis.map((k) => (
              <span
                key={k.label}
                title={k.hint}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-xs"
              >
                <span className="text-muted">{k.label}</span>
                <span className="tnum font-semibold text-navy-800">{k.value}</span>
              </span>
            ))}
          </>,
          headerHost
        )}

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
            <SyncProvenance
              meta={meta}
              period={period}
              sourceLabel={t(SOURCE_KEY[meta.source] ?? "sourceSample")}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <ActivityFeed refreshKey={alertRefresh} />
          <AlertsInbox
            refreshKey={alertRefresh}
            onAlertsChange={setAlerts}
            onStaged={() => {
              // A change-set was staged from an alert: reload the control plane so
              // the pending proposal surfaces, and refresh the activity thread.
              setControlPlaneRefresh((n) => n + 1);
              refreshAlerts();
            }}
          />
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

      {/* Direction 2: the tenant's margin-derived break-even ROAS, surfaced as
          CONTEXT next to the portfolio KPIs — every triage row is judged against a
          margin-blind portfolio target, so this names the ROAS below which a
          campaign actually loses money. Only when a cost model exists. */}
      {breakEven && (
        <p className="flex flex-wrap items-center gap-x-1.5 rounded-card border border-brand-200 bg-brand-50 px-4 py-2.5 text-xs text-navy-700">
          <Gauge width={14} height={14} className="text-brand-600" />
          <span>
            {t("breakEvenNote", {
              roas: fmt.fmtMultiple(breakEven.grossRoas),
              pno: fmt.fmtPct(breakEven.grossPno, 0),
            })}
          </span>
          {breakEven.loadedRoas !== undefined && Number.isFinite(breakEven.loadedRoas) && (
            <span className="text-muted">
              · {t("breakEvenLoaded", { roas: fmt.fmtMultiple(breakEven.loadedRoas) })}
            </span>
          )}
        </p>
      )}

      {error && (
        <p className="rounded-card border border-negative/30 bg-negative-soft px-4 py-3 text-sm text-negative">
          {errText(error)}
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

      {/* per-campaign table — the primary view, moved to the top so row-by-row
          triage is the first thing in focus */}
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
          onRefineReport={(id, note) => void analyze("campaign", id, period, note)}
          period={period}
          fmtMoney={fmtMoney}
          campaignSeries={campaignSeries}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          onPreparePackage={authed ? preparePackage : undefined}
          goals={goals ?? undefined}
        />
      </section>

      {/* what changed since the previous sync */}
      {changes && changes.items.length > 0 && <ChangeStrip changes={changes} fmtMoney={fmtMoney} />}

      <TypeBreakdown
        campaigns={campaigns}
        changesById={changesById}
        activeType={typeFilter}
        onTypeClick={toggleTypeFilter}
        goals={goals ?? undefined}
      />

      {/* Budget governance — one workflow, one place: the deterministic
          recommendation preview (BudgetMoves) flows top-to-bottom into the
          governed change-set + reversible ledger (ControlPlane) under a single
          section heading. The SINGLE propose affordance lives in BudgetMoves
          (the richer preview); ControlPlane's own bare propose button is
          suppressed (hideProposeButton) so the two panels read as one flow. The
          control-plane anchor id (thread.ts reveal target for alert-staging and
          the table's preparePackage) is unchanged — only its position moved. */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Bolt width={18} height={18} className="text-brand-600" />
          <h2 className="text-base font-semibold text-navy-800">{t("govHeading")}</h2>
        </div>
        <BudgetMoves
          campaigns={campaigns}
          marginPct={marginPct}
          period={period}
          fmtMoney={fmtMoney}
          fmtMoneySigned={fmtMoneySigned}
          onProposed={() => setControlPlaneRefresh((n) => n + 1)}
        />
        <ControlPlane refreshKey={controlPlaneRefresh} hideProposeButton fmtMoney={fmtMoney} fmtMoneySigned={fmtMoneySigned} />
      </section>

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
            {authed && (
              <Button
                variant="secondary"
                onClick={() => void analyzeAll()}
                disabled={analyzingAll || syncing}
                title={t("evalAllTitle")}
              >
                {analyzingAll ? (
                  <>
                    <Gauge width={15} height={15} className="animate-pulse" />
                    {t("evalAllBusy")}
                  </>
                ) : (
                  <>
                    <Sparkles width={15} height={15} />
                    {t("evalAll")}
                  </>
                )}
              </Button>
            )}
            <PillButton size="md" press onClick={() => analyze("overall", null, period)} disabled={overallBusy}>
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
            </PillButton>
          </div>
        </div>

        {overallErr && <p className="mt-4 text-sm text-negative">{errText(overallErr)}</p>}
        {shareErr && <p className="mt-3 text-sm text-negative">{shareErr}</p>}
        {batchSummary &&
          (batchSummary.error && batchSummary.evaluated === 0 ? (
            <p className="mt-3 text-sm text-negative">{errText(batchSummary.error)}</p>
          ) : (
            <p className="mt-3 text-sm text-muted">
              <span className="tnum">
                {t("evalAllSummary", { fresh: batchSummary.evaluated, cached: batchSummary.cached })}
              </span>
              {batchSummary.quotaExhausted && (
                <span className="ml-1 text-coral-600">
                  {t("evalAllQuota", { n: batchSummary.remaining })}
                </span>
              )}
              {batchSummary.error && (
                <span className="ml-1 text-negative">{errText(batchSummary.error)}</span>
              )}
            </p>
          ))}
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
              onRefine={(note) => void analyze("overall", null, period, note)}
              refining={overallBusy}
            />
          </div>
        )}
      </section>

      {/* white-label + scheduled client report settings */}
      <ReportSettings breakEven={breakEven} />

      {/* public, SEO-indexable white-label client microsite */}
      <MicrositeCard />
    </div>
  );
}
