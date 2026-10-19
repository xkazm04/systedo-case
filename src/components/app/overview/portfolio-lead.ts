/** The portfolio header's headline totals, with the provenance of what they sum.
 *
 *  A portfolio row is either LIVE (the project has synced rows from an ad platform)
 *  or a SAMPLE fixture. Each table row already labels itself, but the header line
 *  used to sum revenue and cost over every row and print one ROAS: a measured
 *  figure and a fixture figure folded into a number no instrument produced. When
 *  the rows disagree about provenance the header sums the live rows only and says
 *  how many contributed; a header over no live row says it is sample data. Pure and
 *  framework-free so the rule is unit-testable. */
import type { CompareRow } from "./compare";

export type LeadBasis = "live" | "sample" | "live-subset";

export interface PortfolioLead {
  /** every project in the portfolio */
  n: number;
  /** projects whose numbers are summed below */
  counted: number;
  basis: LeadBasis;
  revenue: number;
  cost: number;
  roas: number;
}

export function portfolioLead(rows: readonly CompareRow[]): PortfolioLead {
  const live = rows.filter((r) => r.live);
  const basis: LeadBasis =
    live.length === 0 ? "sample" : live.length === rows.length ? "live" : "live-subset";
  const used = basis === "live-subset" ? live : rows;
  const revenue = used.reduce((s, r) => s + r.totals.revenue, 0);
  const cost = used.reduce((s, r) => s + r.totals.cost, 0);
  return {
    n: rows.length,
    counted: used.length,
    basis,
    revenue,
    cost,
    roas: cost > 0 ? revenue / cost : 0,
  };
}
