/** Illustrative acquisition cohorts for a SaaS/app project. Each cohort is a
 *  month of paid signups with the ad spend that won them, an ARPU, and a monthly
 *  retention curve. Real-integration seam: product-analytics events
 *  (Segment / PostHog / Stripe). */

export interface Cohort {
  /** cohort month label, e.g. "Led 2026" */
  month: string;
  /** paid signups in the cohort */
  signups: number;
  /** ad spend that acquired them (CZK) */
  spend: number;
  /** average revenue per active user per month (CZK) */
  arpu: number;
  /** fraction still active in month M0, M1, … */
  retention: number[];
}

export const SAMPLE_COHORTS: Cohort[] = [
  { month: "Led 2026", signups: 210, spend: 178_500, arpu: 290, retention: [1, 0.72, 0.61, 0.54, 0.5, 0.47] },
  { month: "Úno 2026", signups: 245, spend: 210_700, arpu: 295, retention: [1, 0.7, 0.59, 0.52, 0.48, 0.45] },
  { month: "Bře 2026", signups: 288, spend: 233_280, arpu: 300, retention: [1, 0.74, 0.63, 0.56, 0.52, 0.49] },
  { month: "Dub 2026", signups: 263, spend: 252_480, arpu: 298, retention: [1, 0.68, 0.56, 0.5, 0.46, 0.43] },
  { month: "Kvě 2026", signups: 312, spend: 274_560, arpu: 305, retention: [1, 0.75, 0.64, 0.58, 0.54] },
  { month: "Čvn 2026", signups: 298, spend: 295_020, arpu: 302, retention: [1, 0.71, 0.6, 0.53] },
];
