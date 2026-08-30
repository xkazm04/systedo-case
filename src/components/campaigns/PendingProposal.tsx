"use client";

/** The APPROVAL GATE of the control plane: the pending change-set's moves and
 *  guardrail breaches, and the two-step confirm button that turns a proposal into
 *  real money moving. The estimate it is approved on lives next door in
 *  ProposalProjection; this file is about consent.
 *
 *  Extracted from ControlPlane (WP S1) so the console could gain a network switch
 *  and a Sklik confirmation without the file growing. */
import { Check, Info } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import type { ChangeSet } from "@/lib/campaigns/control-plane-types";
import { moveRowLabel, moveShowsValueGain } from "@/lib/campaigns/move-label";
import { revealThreadTarget, THREAD_ANCHORS } from "./thread";
import ProposalProjection, { CalibrationPill } from "./ProposalProjection";

const T = {
  cs: {
    pendingHeading: "Návrh ke schválení",
    statusPending: "Čeká na schválení",
    sklikWarning: "Provede skutečnou změnu rozpočtu ve Skliku",
    sklikWarningTitle:
      "Schválení zapíše nové denní rozpočty přímo do účtu Sklik. Vrácení obnoví přesné původní" +
      " hodnoty ze snímku, ale mezitím se podle nich už bude inzerovat.",
    confirmOverride: "Potvrdit i přes pojistky",
    confirmApply: "Potvrdit a aplikovat na účet",
    confirmApplySklik: "Potvrdit zápis do Skliku",
    approveOverride: "Schválit přes pojistky",
    approve: "Schválit a aplikovat",
    fromAlert: "Z upozornění",
    fromAlertTitle: "Zobrazit související upozornění ve schránce",
  },
  en: {
    pendingHeading: "Proposal awaiting approval",
    statusPending: "Pending approval",
    sklikWarning: "This makes a real budget change in Sklik",
    sklikWarningTitle:
      "Approving writes the new daily budgets straight into the Sklik account. A revert restores" +
      " the exact prior values from the snapshot, but the account advertises on them meanwhile.",
    confirmOverride: "Confirm despite guardrails",
    confirmApply: "Confirm and apply to account",
    confirmApplySklik: "Confirm the write to Sklik",
    approveOverride: "Approve despite guardrails",
    approve: "Approve and apply",
    fromAlert: "From alert",
    fromAlertTitle: "Show the related alert in the inbox",
  },
} as const;

export default function PendingProposal({
  pending,
  busy,
  confirming,
  onArm,
  onApprove,
  isSklik,
  money,
  moneySigned,
}: {
  pending: ChangeSet;
  busy: boolean;
  /** true once the operator armed the second (confirming) click */
  confirming: boolean;
  onArm: () => void;
  onApprove: (override: boolean) => void;
  /** WP S1 — this set writes to Sklik, so the confirm step says so out loud */
  isSklik: boolean;
  money: (n: number) => string;
  moneySigned: (n: number) => string;
}) {
  const t = useT(T);
  const breached = pending.violations.length > 0;

  return (
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
        <span className="pill bg-coral-soft text-coral-600">{t("statusPending")}</span>
      </div>

      <CalibrationPill set={pending} />

      <ul className="mt-3 space-y-1.5">
        {/* WP S1b — row shape from the pure, unit-pinned `moveRowLabel`: all four kinds read
            honestly (a pause is no arrow to nowhere; a criterion move names its query) and a
            negative omits its 0 gain. `moneySigned`: a reversal set negates estValueGain. */}
        {pending.moves.map((m, i) => (
          <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
            <span className="text-navy-800">{moveRowLabel(m)}</span>
            <span className="tnum text-muted">
              {money(m.amount)}{moveShowsValueGain(m) ? ` · ${moneySigned(m.estValueGain)}` : ""}
            </span>
          </li>
        ))}
      </ul>

      <ProposalProjection set={pending} money={money} />

      {breached && (
        <ul className="mt-3 space-y-1">
          {pending.violations.map((v, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-coral-600">
              <Info width={13} height={13} className="mt-0.5 shrink-0" />
              {v}
            </li>
          ))}
        </ul>
      )}

      {/* WP S1 — the third confirm condition. A Google set has always said "apply to
          account"; a Sklik set is the FIRST thing this product writes to Seznam, so
          it names the network before the click, not after. */}
      {isSklik && (
        <p
          className="mt-3 inline-flex items-center gap-1.5 rounded-card bg-coral-soft px-3 py-1.5 text-xs font-medium text-coral-600"
          title={t("sklikWarningTitle")}
        >
          <Info width={14} height={14} className="shrink-0" />
          {t("sklikWarning")}
        </p>
      )}

      <button
        type="button"
        onClick={() => (confirming ? onApprove(breached) : onArm())}
        disabled={busy}
        className={`mt-3 inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
          confirming || breached ? "bg-negative hover:bg-negative/90" : "bg-brand-700 hover:bg-brand-800"
        }`}
      >
        <Check width={15} height={15} />
        {confirming
          ? breached
            ? t("confirmOverride")
            : isSklik
              ? t("confirmApplySklik")
              : t("confirmApply")
          : breached
            ? t("approveOverride")
            : t("approve")}
      </button>
    </div>
  );
}
