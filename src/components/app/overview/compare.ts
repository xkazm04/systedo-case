/** Shared model for the cross-project portfolio comparison on the Overview.
 *  Framework-free (no React) so the server ProjectOverview can build rows and the
 *  client PortfolioCompare can render them. */
import type { ProjectType } from "@/lib/projects/types";
import type { Totals } from "@/lib/metrics";
import type { SupportedLocale } from "@/lib/format";

export interface CompareRow {
  id: string;
  name: string;
  type: ProjectType;
  accentColor: string;
  domain?: string;
  /** honest data-source signal for the row's numbers — true only once the project has
   *  actually SYNCED rows (`hasSyncedMetrics`), the same truth the single-project
   *  Overview pill reads. Demo fixture ids are always false (never persisted). */
  live: boolean;
  /** last-30-day totals for the project's scaled dataset */
  totals: Totals;
  /** monthly revenue, last 12 months — the comparison sparkline */
  revenueSpark: number[];
}

const T = {
  cs: {
    eyebrow: "Portfolio",
    title: "Srovnání projektů",
    lead: "Klíčové ukazatele napříč {n} projekty za posledních 30 dní.",
    project: "Projekt",
    revenue: "Obrat",
    cost: "Náklady",
    conversions: "Konverze",
    roas: "ROAS",
    pno: "PNO",
    trend: "Obrat 12 měs.",
    here: "tento projekt",
    pnoTargetHint: "Obecný práh napříč typy: cíl ≤ 20 %",
    pnoAboveTarget: "nad cílem",
  },
  en: {
    eyebrow: "Portfolio",
    title: "Project comparison",
    lead: "Headline metrics across {n} projects over the last 30 days.",
    project: "Project",
    revenue: "Revenue",
    cost: "Cost",
    conversions: "Conversions",
    roas: "ROAS",
    pno: "PNO",
    trend: "Revenue 12mo",
    here: "current project",
    pnoTargetHint: "Generic cross-type bar: target ≤ 20%",
    pnoAboveTarget: "above target",
  },
} as const;

export function compareLabels(locale: SupportedLocale) {
  return locale === "en" ? T.en : T.cs;
}
