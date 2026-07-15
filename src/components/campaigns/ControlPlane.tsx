"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bolt, Check, Refresh, Info } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useOptionalProject } from "@/lib/projects/context";
import { useAsyncAction } from "@/components/hooks/useAsyncAction";
import {
  projectedValueGain,
  projectedProfitGain,
  forwardProjectionApplies,
  type ChangeSet,
  type ChangeSetStatus,
} from "@/lib/campaigns/control-plane-types";
import { simulationConfidence } from "@/lib/campaigns/simulate";
import { revealThreadTarget, THREAD_ANCHORS } from "./thread";

const T = {
  cs: {
    heading: "Řízení rozpočtů (control plane)",
    propose: "Navrhnout změnový balíček",
    subtitle:
      "Dávka doporučených přesunů rozpočtu — nejdřív simulace dopadu, pak lidské schválení, vždy" +
      " s možností vrácení. Bezpečný způsob, jak nechat software sahat na reálnou útratu.",
    pendingHeading: "Návrh ke schválení",
    statusPending: "Čeká na schválení",
    statusApplied: "Aplikováno",
    statusReverted: "Vráceno",
    statusApplying: "Aplikuje se…",
    statusReverting: "Vrací se…",
    projectedGain: "Projektovaný přínos ≈",
    projectedProfit: "Projektovaný zisk ≈",
    marginStated: "při marži {m}",
    convValue: "Hodnota",
    linEst: "hodnoty konverzí (lineární odhad).",
    lowConfidence: "Nižší jistota odhadu",
    lowConfidenceTitle:
      "Některý přesun přemísťuje více než polovinu rozpočtu dárce — lineární odhad je za hranicí" +
      " „malé realokace“ a dopad může být nadhodnocený.",
    confirmOverride: "Potvrdit i přes pojistky",
    confirmApply: "Potvrdit a aplikovat na účet",
    approveOverride: "Schválit přes pojistky",
    approve: "Schválit a aplikovat",
    ledgerHeading: "Historie balíčků",
    fromAlert: "Z upozornění",
    fromAlertTitle: "Zobrazit související upozornění ve schránce",
    moves: "{n} přesunů",
    applied: "{ok}/{total} aplikováno",
    revert: "Vrátit zpět",
    errorFailed: "Akce se nezdařila.",
    errorServer: "Nepodařilo se spojit se serverem.",
  },
  en: {
    heading: "Budget management (control plane)",
    propose: "Propose change package",
    subtitle:
      "A batch of recommended budget moves — impact simulation first, then human approval, always" +
      " with a rollback option. The safe way to let software touch real spend.",
    pendingHeading: "Proposal awaiting approval",
    statusPending: "Pending approval",
    statusApplied: "Applied",
    statusReverted: "Reverted",
    statusApplying: "Applying…",
    statusReverting: "Reverting…",
    projectedGain: "Projected gain ≈",
    projectedProfit: "Projected profit ≈",
    marginStated: "at a {m} margin",
    convValue: "Value",
    linEst: "conversion value (linear estimate).",
    lowConfidence: "Lower-confidence estimate",
    lowConfidenceTitle:
      "A move re-points more than half of its donor's budget — the linear estimate is beyond the" +
      " \"small reallocation\" it is honest for, so the projected impact may be overstated.",
    confirmOverride: "Confirm despite guardrails",
    confirmApply: "Confirm and apply to account",
    approveOverride: "Approve despite guardrails",
    approve: "Approve and apply",
    ledgerHeading: "Package history",
    fromAlert: "From alert",
    fromAlertTitle: "Show the related alert in the inbox",
    moves: "{n} moves",
    applied: "{ok}/{total} applied",
    revert: "Revert",
    errorFailed: "Action failed.",
    errorServer: "Could not reach the server.",
  },
} as const;

const STATUS_STYLE: Record<ChangeSetStatus, string> = {
  pending: "bg-coral-soft text-coral-600",
  applying: "bg-coral-soft text-coral-600",
  applied: "bg-positive-soft text-positive",
  reverting: "bg-navy-50 text-muted",
  reverted: "bg-navy-50 text-muted",
};

/** Ad-ops control plane: bundle recommended budget moves into a simulated,
 *  human-approved change-set with a reversible ledger. The governance envelope
 *  that makes touching real spend safe. Anonymous → hidden. */
export default function ControlPlane({
  refreshKey = 0,
  hideProposeButton = false,
}: {
  refreshKey?: number;
  /** Suppress the header's bare "Navrhnout změnový balíček" button. Set when the
   *  richer BudgetMoves preview renders directly above with its own single propose
   *  affordance, so the co-located budget-governance section has ONE way to
   *  propose (see CampaignsClient). */
  hideProposeButton?: boolean;
}) {
  const { status } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const [sets, setSets] = useState<ChangeSet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { busy, error, setError, run } = useAsyncAction();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fmt = useFormatters();
  const t = useT(T);

  const STATUS_LABEL: Record<ChangeSetStatus, string> = {
    pending: t("statusPending"),
    applying: t("statusApplying"),
    applied: t("statusApplied"),
    reverting: t("statusReverting"),
    reverted: t("statusReverted"),
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(pid ? `/api/campaigns/control-plane?projectId=${encodeURIComponent(pid)}` : "/api/campaigns/control-plane");
      if (!res.ok) return;
      const json = (await res.json()) as { changeSets?: ChangeSet[] };
      setSets(json.changeSets ?? []);
    } catch {
      /* non-critical */
    } finally {
      setLoaded(true);
    }
  }, [pid]);

  useEffect(() => {
    // Reload on auth resolve and whenever the BudgetMoves panel proposes a new
    // change-set (refreshKey bump), so a fresh proposal surfaces here at once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load, refreshKey]);

  const act = (action: "create" | "approve" | "revert", id?: string, override?: boolean) =>
    run(
      async () => {
        const res = await fetch("/api/campaigns/control-plane", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, id, override, projectId: pid }),
        });
        const json = await res.json();
        if (!res.ok) setError(json?.error ?? t("errorFailed"));
        await load();
      },
      { serverError: t("errorServer"), onSettled: () => setConfirmId(null) }
    );

  if (status !== "authenticated" || !loaded) return null;

  const pending = sets.find((s) => s.status === "pending");

  return (
    <section className="card p-6" id={THREAD_ANCHORS.controlPlane}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bolt width={16} height={16} className="text-brand-accent" />
          <h2 className="text-base font-semibold text-navy-800">{t("heading")}</h2>
        </div>
        {!hideProposeButton && (
          <button
            type="button"
            onClick={() => act("create")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-pill border border-line px-4 py-2 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-60"
          >
            <Refresh width={15} height={15} className={busy ? "animate-spin" : ""} />
            {t("propose")}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}

      {/* pending change-set — the approval gate */}
      {pending && (
        <div className="mt-4 rounded-card border border-coral-200 bg-coral-soft/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-navy-800">
              {t("pendingHeading")}
              {pending.alertId && (
                <button
                  type="button"
                  onClick={() => revealThreadTarget(THREAD_ANCHORS.alertsInbox)}
                  title={t("fromAlertTitle")}
                  className="pill cursor-pointer bg-coral-soft text-coral-600 transition-shadow hover:shadow-card"
                >
                  {t("fromAlert")}
                </button>
              )}
            </span>
            <span className={`pill ${STATUS_STYLE.pending}`}>{STATUS_LABEL.pending}</span>
          </div>

          <ul className="mt-3 space-y-1.5">
            {pending.moves.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                <span className="text-navy-800">
                  {m.fromName} <span className="text-muted">→</span> {m.toName}
                </span>
                {/* signed helper: a reversal change-set negates estValueGain, so a
                    hand-written "+" here would render "+−…" */}
                <span className="tnum text-muted">
                  {fmt.fmtCZK(m.amount)} · {fmt.fmtSignedCZK(m.estValueGain)}
                </span>
              </li>
            ))}
          </ul>

          {/* simulated impact — a FORWARD projection, only shown while the set is
              pending/applying (forwardProjectionApplies); a reverted set never
              displays its stale forward numbers. The pending block itself is
              pending-only, so this is defensive + explicit. */}
          {forwardProjectionApplies(pending.status) && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <SimCell label="ROAS" before={fmt.fmtMultiple(pending.simulation.before.roas)} after={fmt.fmtMultiple(pending.simulation.after.roas)} />
                <SimCell label="COS" before={fmt.fmtPct(pending.simulation.before.pno)} after={fmt.fmtPct(pending.simulation.after.pno)} />
                <SimCell label={t("convValue")} before={fmt.fmtCZK(pending.simulation.before.conversionValue)} after={fmt.fmtCZK(pending.simulation.after.conversionValue)} />
              </div>
              <p className="mt-2 text-xs text-muted">
                {t("projectedGain")} <strong className="text-navy-700">{fmt.fmtCZK(projectedValueGain(pending.simulation))}</strong> {t("linEst")}
              </p>
              {simulationConfidence(pending.moves) === "low" && (
                <p
                  className="mt-2 inline-flex items-center gap-1.5 rounded-card bg-coral-soft px-3 py-1.5 text-xs font-medium text-coral-600"
                  title={t("lowConfidenceTitle")}
                >
                  <Info width={14} height={14} className="shrink-0" />
                  {t("lowConfidence")}
                </p>
              )}
            </>
          )}
          {/* Direction 1: projected NET PROFIT alongside the value, when the set was
              scored against the tenant's persisted blended margin — derived from the
              same value simulation (margin × value gain), with the margin stated. */}
          {(() => {
            const profit = projectedProfitGain(pending.simulation, pending.marginPct);
            return profit === undefined ? null : (
              <p className="mt-1 text-xs text-muted">
                {t("projectedProfit")}{" "}
                <strong className="text-positive">{fmt.fmtCZK(profit)}</strong>{" "}
                <span className="text-muted">{t("marginStated", { m: fmt.fmtPct(pending.marginPct!, 0) })}</span>
              </p>
            );
          })()}

          {pending.violations.length > 0 && (
            <ul className="mt-3 space-y-1">
              {pending.violations.map((v, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-coral-600">
                  <Info width={13} height={13} className="mt-0.5 shrink-0" />
                  {v}
                </li>
              ))}
            </ul>
          )}

          {(() => {
            const breached = pending.violations.length > 0;
            const confirming = confirmId === pending.id;
            return (
              <button
                type="button"
                onClick={() => (confirming ? act("approve", pending.id, breached) : setConfirmId(pending.id))}
                disabled={busy}
                className={`mt-3 inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                  confirming || breached ? "bg-negative hover:bg-negative/90" : "bg-brand-600 hover:bg-brand-700"
                }`}
              >
                <Check width={15} height={15} />
                {confirming
                  ? breached
                    ? t("confirmOverride")
                    : t("confirmApply")
                  : breached
                    ? t("approveOverride")
                    : t("approve")}
              </button>
            );
          })()}
        </div>
      )}

      {/* ledger */}
      {sets.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("ledgerHeading")}</h3>
          <ul className="mt-2 space-y-1.5">
            {sets.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className={`pill ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                  {s.alertId && (
                    <button
                      type="button"
                      onClick={() => revealThreadTarget(THREAD_ANCHORS.alertsInbox)}
                      title={t("fromAlertTitle")}
                      className="pill cursor-pointer bg-coral-soft text-coral-600 transition-shadow hover:shadow-card"
                    >
                      {t("fromAlert")}
                    </button>
                  )}
                  <span className="text-navy-800">{t("moves", { n: s.moves.length })}</span>
                  {s.results && (
                    <span className="text-xs text-muted">
                      {t("applied", { ok: s.results.filter((r) => r.ok).length, total: s.results.length })}
                    </span>
                  )}
                  <time className="text-xs text-muted">{fmt.fmtRelative(s.createdAt)}</time>
                </span>
                {s.status === "applied" && (
                  <button
                    type="button"
                    onClick={() => act("revert", s.id)}
                    disabled={busy}
                    className="text-xs font-medium text-brand-accent hover:underline disabled:opacity-60"
                  >
                    {t("revert")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SimCell({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="rounded-lg bg-surface px-2 py-2">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-0.5 text-xs text-muted">
        <span className="tnum">{before}</span>
        <span className="mx-1">→</span>
        <span className="tnum font-semibold text-navy-800">{after}</span>
      </p>
    </div>
  );
}
