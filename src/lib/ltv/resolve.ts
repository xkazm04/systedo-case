/** Direction 2 — one cohort truth. The /ltv page used to read the RAW static cohort
 *  constants (SAMPLE_COHORTS / ESHOP_COHORTS, identical across every project) while the
 *  monthly report's "Beyond this period" block read the project-varied sample
 *  (cohortsForProject) — so the same project showed two different LTV:CAC across the two
 *  surfaces. This is the single resolver both consume, so they always agree numerically.
 *
 *  It returns the project-varied illustrative sample (via varyCohorts) as the HONEST
 *  FLOOR: e-shop projects keep the exact eshop variation cohortsForProject already
 *  produced (report numbers unchanged), SaaS/app projects get the same treatment over
 *  the signup/retention base. Deterministic per project.
 *
 *  ── Future live seam ──────────────────────────────────────────────────────────
 *  When real cohort economics land (e-shop orders/customers from Shoptet/Shopify/GA4;
 *  SaaS events from Segment/PostHog/Stripe — the seam each LtvModule footer already
 *  names), this is the ONE place to resolve them over the sample: read the project's
 *  synced cohorts and fall back to varyCohorts when absent, exactly as
 *  resolveReportDataset does for the report. Both surfaces then inherit live data for
 *  free, and the `sample` provenance flag flips off here — no caller changes. */
import type { Project } from "@/lib/projects/types";
import type { Cohort } from "./sample";
import { varyCohorts, ESHOP_COHORTS, SAMPLE_COHORTS } from "./sample";

/** The project's resolved acquisition cohorts — today always the project-varied
 *  illustrative sample (the honest floor), typed by project kind: e-shop reads the
 *  customer / AOV / repeat-purchase base, everything else the signup / ARPU /
 *  retention base. The CAC/LTV/payback math is identical over both. */
export function resolveCohorts(project: Project): Cohort[] {
  return varyCohorts(project, project.type === "eshop" ? ESHOP_COHORTS : SAMPLE_COHORTS);
}
