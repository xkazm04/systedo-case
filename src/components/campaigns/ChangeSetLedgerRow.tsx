"use client";

import { useFormatters, useT } from "@/lib/i18n/client";
import { changeSetSource, type ChangeSet, type ChangeSetStatus } from "@/lib/campaigns/control-plane-types";
import { revealThreadTarget, THREAD_ANCHORS } from "./thread";
import RealizedLine from "./RealizedLine";

const T = {
  cs: {
    statusPending: "Čeká na schválení",
    statusApplied: "Aplikováno",
    statusReverted: "Vráceno",
    statusApplying: "Aplikuje se…",
    statusReverting: "Vrací se…",
    statusFailed: "Selhalo",
    fromAlert: "Z upozornění",
    fromAlertTitle: "Zobrazit související upozornění ve schránce",
    moves: "{n} přesunů",
    applied: "{ok}/{total} aplikováno",
    revert: "Vrátit zpět",
    sklik: "Sklik",
    sklikTitle: "Tento balíček zapisuje do účtu Sklik, ne do Google Ads.",
  },
  en: {
    statusPending: "Pending approval",
    statusApplied: "Applied",
    statusReverted: "Reverted",
    statusApplying: "Applying…",
    statusReverting: "Reverting…",
    statusFailed: "Failed",
    fromAlert: "From alert",
    fromAlertTitle: "Show the related alert in the inbox",
    moves: "{n} moves",
    applied: "{ok}/{total} applied",
    revert: "Revert",
    sklik: "Sklik",
    sklikTitle: "This change set writes to the Sklik account, not to Google Ads.",
  },
} as const;

const STATUS_STYLE: Record<ChangeSetStatus, string> = {
  pending: "bg-coral-soft text-coral-600",
  applying: "bg-coral-soft text-coral-600",
  applied: "bg-positive-soft text-positive",
  reverting: "bg-navy-50 text-muted",
  reverted: "bg-navy-50 text-muted",
  failed: "bg-coral-soft text-coral-600",
};

/** One row of the change-set ledger: the governance record of a proposal, plus —
 *  for a set that was actually applied — the REALIZED line scoring it against the
 *  projection it was approved on. Extracted from ControlPlane so the console keeps
 *  shrinking rather than growing (rubric A1). */
export default function ChangeSetLedgerRow({
  set,
  busy,
  now,
  onRevert,
  money,
  moneySigned,
}: {
  set: ChangeSet;
  busy: boolean;
  /** the console's one clock, null until its first tick (see ControlPlane) */
  now: number | null;
  onRevert: () => void;
  /** currency-aware formatters from CampaignsClient (the realized delta is signed) */
  money: (n: number) => string;
  moneySigned: (n: number) => string;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  const STATUS_LABEL: Record<ChangeSetStatus, string> = {
    pending: t("statusPending"),
    applying: t("statusApplying"),
    applied: t("statusApplied"),
    reverting: t("statusReverting"),
    reverted: t("statusReverted"),
    failed: t("statusFailed"),
  };

  return (
    <li className="rounded-lg border border-line px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className={`pill ${STATUS_STYLE[set.status]}`}>{STATUS_LABEL[set.status]}</span>
          {/* WP S1 — which network this set wrote to. Shown only for Sklik: Google
              is the historical default, so a pill on every legacy row would be
              noise, while a Sklik row genuinely needs to say so. */}
          {changeSetSource(set) === "sklik" && (
            <span className="pill bg-navy-50 text-muted" title={t("sklikTitle")}>
              {t("sklik")}
            </span>
          )}
          {set.alertId && (
            <button
              type="button"
              onClick={() => revealThreadTarget(THREAD_ANCHORS.alertsInbox)}
              title={t("fromAlertTitle")}
              className="pill cursor-pointer bg-coral-soft text-coral-600 transition-shadow hover:shadow-card"
            >
              {t("fromAlert")}
            </button>
          )}
          <span className="text-navy-800">{t("moves", { n: set.moves.length })}</span>
          {set.results && (
            <span className="text-xs text-muted">
              {t("applied", { ok: set.results.filter((r) => r.ok).length, total: set.results.length })}
            </span>
          )}
          <time className="text-xs text-muted">{fmt.fmtRelative(set.createdAt)}</time>
        </span>
        {set.status === "applied" && (
          <button
            type="button"
            onClick={onRevert}
            disabled={busy}
            className="text-xs font-medium text-brand-accent hover:underline disabled:opacity-60"
          >
            {t("revert")}
          </button>
        )}
      </div>
      {set.status === "applied" && <RealizedLine set={set} now={now} money={money} moneySigned={moneySigned} />}
    </li>
  );
}
