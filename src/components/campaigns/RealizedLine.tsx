"use client";

/** The REALIZED line under an applied change-set: what the touched campaigns
 *  actually did in the 7 days after the apply versus the 7 before, scored against
 *  the projection the set was approved on — or an honest "not enough data", or a
 *  countdown to when the window closes.
 *
 *  Extracted from ChangeSetLedgerRow (WP S1) so the row could take its network pill
 *  without the file growing: the measurement's copy, its three states and its plural
 *  handling are one concern, and the ledger row is another. */
import { useFormatters, useT } from "@/lib/i18n/client";
import { czPlural } from "@/lib/format";
import { REALIZE_WINDOW_DAYS } from "@/lib/campaigns/realize";
import type { ChangeSet } from "@/lib/campaigns/control-plane-types";

const T = {
  cs: {
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** The realized-impact line for an applied set: a measurement, an honest "not
 *  enough data", or a countdown to when the window closes. Nothing at all for a
 *  set stored before the ledger existed AND with no parseable approval stamp. */
export default function RealizedLine({
  set,
  now,
  money,
  moneySigned,
}: {
  set: ChangeSet;
  /** the console's one clock, null until its first tick (see ControlPlane) */
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
