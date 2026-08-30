"use client";

/** WP S1b — the two query lists inside the search-terms panel: the costliest queries
 *  that converted NOTHING, and the ones that converted.
 *
 *  Extracted from SearchTermsPanel purely for size (the repo's 200-LOC rule), but the
 *  split lands on a real seam: this file decides only how a query READS, and knows
 *  nothing about proposing. It filters with the recommender's OWN exported predicates
 *  rather than re-stating the thresholds, so what the operator sees here can never
 *  drift from what the "Navrhnout negativa" button would actually propose. */

import { useT } from "@/lib/i18n/client";
import type { SearchTermRow } from "@/lib/campaigns/store/search-terms";
import {
  isProvenTerm,
  isWastedTerm,
  PROMOTE_MIN_CONVERSIONS,
  TERM_MIN_CLICKS,
  TERM_MIN_SPEND_CZK,
} from "@/lib/campaigns/term-moves";

const T = {
  cs: {
    wasted: "Utrácí bez konverzí",
    converting: "Konvertující dotazy",
    noneWasted: "Žádný dotaz nepřekračuje prahy pro vyloučení.",
    noneConverting: "Žádný dotaz zatím nemá dost konverzí.",
    clicks: "prokliků",
    conversions: "konverzí",
  },
  en: {
    wasted: "Spending with no conversions",
    converting: "Converting queries",
    noneWasted: "No query crosses the exclusion thresholds.",
    noneConverting: "No query has enough conversions yet.",
    clicks: "clicks",
    conversions: "conversions",
  },
} as const;

/** How many queries each column shows. Five is a glance, not a report — the point of
 *  the panel is a decision, and the full list would bury it. */
const TOP_N = 5;

/** One query row: the term, then its money and the single number that decides its
 *  fate (clicks for a wasted query, conversions for a converting one). The campaign
 *  rides in the title attribute — it matters when acting, not when scanning. */
function TermRow({ row, metric, money }: { row: SearchTermRow; metric: string; money: (n: number) => string }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
      <span className="truncate text-navy-800" title={`${row.term} · ${row.campaignName}`}>
        {row.term}
      </span>
      <span className="tnum shrink-0 text-muted">
        {money(row.cost)} · {metric}
      </span>
    </li>
  );
}

function Column({
  heading,
  empty,
  rows,
  metric,
  money,
  prefix,
}: {
  heading: string;
  empty: string;
  rows: SearchTermRow[];
  metric: (r: SearchTermRow) => string;
  money: (n: number) => string;
  prefix: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{heading}</h3>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <TermRow key={`${prefix}-${r.campaignId}-${r.term}`} row={r} metric={metric(r)} money={money} />
        ))}
        {rows.length === 0 && <li className="text-sm text-muted">{empty}</li>}
      </ul>
    </div>
  );
}

export default function SearchTermsLists({
  terms,
  money,
}: {
  terms: SearchTermRow[];
  money: (n: number) => string;
}) {
  const t = useT(T);
  // The recommender's own predicates — not a re-implementation of the thresholds.
  // `terms` arrives costliest-first from the store, which is the order the wasted
  // column wants; the converting column re-sorts by the number it is judged on.
  const wasted = terms.filter((r) => isWastedTerm(r, TERM_MIN_SPEND_CZK, TERM_MIN_CLICKS)).slice(0, TOP_N);
  const converting = terms
    .filter((r) => isProvenTerm(r, PROMOTE_MIN_CONVERSIONS))
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, TOP_N);

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <Column
        heading={t("wasted")}
        empty={t("noneWasted")}
        rows={wasted}
        metric={(r) => `${Math.round(r.clicks)} ${t("clicks")}`}
        money={money}
        prefix="n"
      />
      <Column
        heading={t("converting")}
        empty={t("noneConverting")}
        rows={converting}
        metric={(r) => `${Math.round(r.conversions)} ${t("conversions")}`}
        money={money}
        prefix="p"
      />
    </div>
  );
}
