"use client";

import { ArrowRight, Check, TrendDown } from "@/components/icons";
import type { TriageSummary } from "@/lib/campaigns/triage";

/** Czech plural for "kampaň": 1 → kampaň, 2–4 → kampaně, else kampaní. */
function campaignWord(n: number): string {
  if (n === 1) return "kampaň";
  if (n >= 2 && n <= 4) return "kampaně";
  return "kampaní";
}

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
  if (summary.total === 0) return null;

  if (summary.attention === 0) {
    return (
      <div className="flex items-center gap-2.5 border-b border-line bg-positive-soft/50 px-4 py-3 text-sm text-positive">
        <Check width={16} height={16} aria-hidden />
        <span className="font-medium">Všechny kampaně plní domluvený cíl.</span>
      </div>
    );
  }

  const verb = summary.attention === 1 ? "vyžaduje" : summary.attention <= 4 ? "vyžadují" : "vyžaduje";
  // sub-breakdown ("2 kritické · 1 ke sledování"), hiding empty tiers
  const parts: string[] = [];
  if (summary.critical > 0) parts.push(`${summary.critical} kritických`);
  if (summary.warning > 0) parts.push(`${summary.warning} ke sledování`);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-coral-soft/60 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-coral-600/15 text-coral-600">
        <TrendDown width={18} height={18} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-navy-800">
          <span className="tnum">{summary.attention}</span> {campaignWord(summary.attention)} {verb}{" "}
          pozornost
        </p>
        {parts.length > 0 && <p className="mt-0.5 text-xs text-muted">{parts.join(" · ")}</p>}
      </div>
      <button
        type="button"
        onClick={onSortBySeverity}
        disabled={sortedBySeverity}
        className="ml-auto inline-flex items-center gap-1.5 rounded-pill border border-coral-400/50 bg-surface px-3 py-1.5 text-xs font-semibold text-coral-600 transition-colors hover:bg-coral-soft disabled:cursor-default disabled:opacity-60"
        title="Seřadit kampaně od nejnaléhavějších"
      >
        {sortedBySeverity ? "Seřazeno podle priority" : "Seřadit podle priority"}
        {!sortedBySeverity && <ArrowRight width={14} height={14} aria-hidden />}
      </button>
    </div>
  );
}
