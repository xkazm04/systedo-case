/** Illustrative lead sources with CRM outcomes for a lead-gen project. The point:
 *  a source can be cheap per lead but expensive per *qualified* lead. Real-
 *  integration seam: CRM webhook (lead → qualified → won + value). */

export interface LeadSource {
  source: string;
  leads: number;
  qualified: number;
  won: number;
  /** ad spend (CZK); 0 for unpaid sources */
  spend: number;
  /** closed-won revenue (CZK) */
  revenue: number;
  /** intermediate funnel stage between qualified (SQL) and won; when present:
   *  qualified ≥ opportunities ≥ won. Absent → opportunity stage is skipped. */
  opportunities?: number;
  /** avg days lead → qualified; absent → velocity hidden */
  daysToQualify?: number;
  /** avg days qualified → won; absent → velocity hidden */
  daysToClose?: number;
  /** campaign label for a per-campaign drill-down */
  campaign?: string;
}

export const SAMPLE_SOURCES: LeadSource[] = [
  // leads ≥ qualified ≥ opportunities ≥ won kept consistent across all rows.
  { source: "Google Ads – Search", leads: 320, qualified: 198, won: 41, spend: 142_000, revenue: 1_640_000, opportunities: 96, daysToQualify: 4, daysToClose: 28, campaign: "Brand + generické" },
  { source: "Sklik", leads: 180, qualified: 92, won: 16, spend: 58_000, revenue: 560_000, opportunities: 38, daysToQualify: 5, daysToClose: 33, campaign: "Výkonové" },
  { source: "Meta lead formuláře", leads: 540, qualified: 130, won: 14, spend: 96_000, revenue: 470_000, opportunities: 31, daysToQualify: 9, daysToClose: 47, campaign: "Lead Ads – studené" },
  { source: "Porovnávače", leads: 95, qualified: 70, won: 22, spend: 41_000, revenue: 880_000, opportunities: 44, daysToQualify: 3, daysToClose: 21 },
  // Unpaid source intentionally left without funnel/velocity fields → graceful degrade.
  { source: "Organic & doporučení", leads: 140, qualified: 110, won: 38, spend: 0, revenue: 1_520_000 },
];
