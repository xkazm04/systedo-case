"use client";

import { ArrowRight, Check, TrendDown } from "@/components/icons";
import type { TriageSummary } from "@/lib/campaigns/triage";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    allOnTarget: "Všechny kampaně plní domluvený cíl.",
    needsAttentionSuffix: "{word} {verb} pozornost",
    critical: "{n} kritických",
    warning: "{n} ke sledování",
    sortButton: "Seřadit podle priority",
    sortedButton: "Seřazeno podle priority",
    sortTitle: "Seřadit kampaně od nejnaléhavějších",
    campaign1: "kampaň",
    campaign234: "kampaně",
    campaignN: "kampaní",
    verb1: "vyžaduje",
    verb234: "vyžadují",
    verbN: "vyžaduje",
  },
  en: {
    allOnTarget: "All campaigns are meeting their agreed target.",
    needsAttentionSuffix: "{word} {verb} attention",
    critical: "{n} critical",
    warning: "{n} to watch",
    sortButton: "Sort by priority",
    sortedButton: "Sorted by priority",
    sortTitle: "Sort campaigns from most urgent",
    campaign1: "campaign",
    campaign234: "campaigns",
    campaignN: "campaigns",
    verb1: "needs",
    verb234: "need",
    verbN: "need",
  },
} as const;

/** Portfolio-level triage headline shown above the campaign table. Summarises how
 *  many campaigns breach a rule and offers a one-click "sort by priority" so the
 *  user lands straight on what is bleeding budget. When everything is on target it
 *  collapses to a quiet all-clear note. */
export default function TriageBanner({
  summary,
  sortedBySeverity,
  onSortBySeverity,
}: {
  summary: TriageSummary;
  sortedBySeverity: boolean;
  onSortBySeverity: () => void;
}) {
  const t = useT(T);

  if (summary.total === 0) return null;

  if (summary.attention === 0) {
    return (
      <div className="flex items-center gap-2.5 border-b border-line bg-positive-soft/50 px-4 py-3 text-sm text-positive">
        <Check width={16} height={16} aria-hidden />
        <span className="font-medium">{t("allOnTarget")}</span>
      </div>
    );
  }

  const n = summary.attention;
  const word = n === 1 ? t("campaign1") : n >= 2 && n <= 4 ? t("campaign234") : t("campaignN");
  const verb = n === 1 ? t("verb1") : n >= 2 && n <= 4 ? t("verb234") : t("verbN");
  const suffix = t("needsAttentionSuffix", { word, verb });

  // sub-breakdown ("2 critical · 1 to watch"), hiding empty tiers
  const parts: string[] = [];
  if (summary.critical > 0) parts.push(t("critical", { n: summary.critical }));
  if (summary.warning > 0) parts.push(t("warning", { n: summary.warning }));

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-coral-soft/60 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-coral-600/15 text-coral-600">
        <TrendDown width={18} height={18} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-navy-800">
          <span className="tnum">{n}</span>{" "}{suffix}
        </p>
        {parts.length > 0 && <p className="mt-0.5 text-xs text-muted">{parts.join(" · ")}</p>}
      </div>
      <button
        type="button"
        onClick={onSortBySeverity}
        disabled={sortedBySeverity}
        className="ml-auto inline-flex items-center gap-1.5 rounded-pill border border-coral-400/50 bg-surface px-3 py-1.5 text-xs font-semibold text-coral-600 transition-colors hover:bg-coral-soft disabled:cursor-default disabled:opacity-60"
        title={t("sortTitle")}
      >
        {sortedBySeverity ? t("sortedButton") : t("sortButton")}
        {!sortedBySeverity && <ArrowRight width={14} height={14} aria-hidden />}
      </button>
    </div>
  );
}
