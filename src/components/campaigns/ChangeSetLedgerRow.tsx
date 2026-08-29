"use client";

import { useFormatters, useT } from "@/lib/i18n/client";
import { czPlural } from "@/lib/format";
import { REALIZE_WINDOW_DAYS } from "@/lib/campaigns/realize";
import type { ChangeSet, ChangeSetStatus } from "@/lib/campaigns/control-plane-types";
import { revealThreadTarget, THREAD_ANCHORS } from "./thread";

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
    realized: "Realizováno: {real} vs. projekce {proj} ({pct})",
    realizedNoRatio: "Realizováno: {real} vs. projekce {proj}",
    realizedTitle: "Součet hodnoty konverzí dotčených kampaní za 7 dní po aplikaci minus 7 dní před ní, proti projekci balíčku. Pozorovaný rozdíl, nikoli důkaz příčiny — účet se za těch 14 dní hýbal i jinak.",
    insufficient: "Nedostatek dat pro vyhodnocení",
    insufficientTitle: "Uložená denní data nepokrývají dost dní některého ze dvou sedmidenních oken (kampaňová řada drží jen aktivní období), takže by měření nebylo poctivé.",
    evalIn: "Vyhodnocení za {n} {unit}",
    evalSoon: "Vyhodnocení po nejbližší synchronizaci",
    dayOne: "den",
    dayFew: "dny",
    dayMany: "dní",
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
    realized: "Realized: {real} vs. projected {proj} ({pct})",
    realizedNoRatio: "Realized: {real} vs. projected {proj}",
    realizedTitle: "Conversion value of the touched campaigns over the 7 days after the apply minus the 7 days before, against the set's projection. An observed difference, not proof of cause — the account moved for other reasons over those 14 days too.",
    insufficient: "Not enough data to evaluate",
    insufficientTitle: "The stored daily series does not cover enough days of one of the two 7-day windows (the per-campaign series holds only the active period), so a measurement would not be honest.",
    evalIn: "Evaluation in {n} {unit}",
    evalSoon: "Evaluation after the next sync",
    dayOne: "day",
    dayFew: "days",
    dayMany: "days",
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

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** The realized-impact line for an applied set: a measurement, an honest "not
 *  enough data", or a countdown to when the window closes. Nothing at all for a
 *  set stored before the ledger existed AND with no parseable approval stamp. */
function RealizedLine({
  set,
  now,
  money,
  moneySigned,
}: {
  set: ChangeSet;
  now: number | null;
  money: (n: number) => string;
  moneySigned: (n: number) => string;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const r = set.realized;
  if (r?.status === "insufficient") {
    return (
      <p className="mt-1 text-xs text-muted" title={t("insufficientTitle")}>
        {t("insufficient")}
      </p>
    );
  }
  if (r?.status === "measured") {
    const tone = r.realizedValueDelta >= 0 ? "text-positive" : "text-coral-600";
    return (
      <p className="mt-1 text-xs text-muted" title={t("realizedTitle")}>
        <span className={`tnum font-medium ${tone}`}>
          {r.ratio === null
            ? t("realizedNoRatio", {
                real: moneySigned(r.realizedValueDelta),
                proj: money(r.projectedValueGain),
              })
            : t("realized", {
                real: moneySigned(r.realizedValueDelta),
                proj: money(r.projectedValueGain),
                pct: fmt.fmtPct(r.ratio, 0),
              })}
        </span>
      </p>
    );
  }
  // Not measured yet — say when it will be, rather than showing nothing. Needs the
  // console's clock, which is null until its first tick (never read during render).
  const at = set.approvedAt ? Date.parse(set.approvedAt) : NaN;
  return Number.isNaN(at) || now === null ? null : <EvaluationCountdown at={at} now={now} />;
}

/** "Vyhodnocení za N dní" — when the after-window of an applied set closes. */
function EvaluationCountdown({ at, now }: { at: number; now: number }) {
  const t = useT(T);
  const days = Math.ceil((at + REALIZE_WINDOW_DAYS * DAY_MS - now) / DAY_MS);
  if (days <= 0) return <p className="mt-1 text-xs text-muted">{t("evalSoon")}</p>;
  // Czech has three plural forms — "za 1 dní" reads as broken copy; en's three keys
  // collapse to day/days/days, so one call serves both locales.
  const unit = czPlural(days, t("dayOne"), t("dayFew"), t("dayMany"));
  return <p className="mt-1 text-xs text-muted">{t("evalIn", { n: days, unit })}</p>;
}
