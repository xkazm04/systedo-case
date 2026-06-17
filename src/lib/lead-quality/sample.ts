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
}

export const SAMPLE_SOURCES: LeadSource[] = [
  { source: "Google Ads – Search", leads: 320, qualified: 198, won: 41, spend: 142_000, revenue: 1_640_000 },
  { source: "Sklik", leads: 180, qualified: 92, won: 16, spend: 58_000, revenue: 560_000 },
  { source: "Meta lead formuláře", leads: 540, qualified: 130, won: 14, spend: 96_000, revenue: 470_000 },
  { source: "Porovnávače", leads: 95, qualified: 70, won: 22, spend: 41_000, revenue: 880_000 },
  { source: "Organic & doporučení", leads: 140, qualified: 110, won: 38, spend: 0, revenue: 1_520_000 },
];
