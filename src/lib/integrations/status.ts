/** Server-only reader that turns the real environment + the active project into
 *  integration-readiness rows. Kept apart from compute.ts (which stays pure and
 *  testable) so this file — which touches process.env — never leaks into a client
 *  bundle. Mirrors how local-seo's /api/health surfaced connector presence. */
import "server-only";
import type { Project } from "@/lib/projects/types";
import { computeIntegrationRows, type IntegrationRow } from "./compute";

const has = (v: string | undefined): boolean => typeof v === "string" && v.trim() !== "";

export function integrationStatus(project: Project): IntegrationRow[] {
  const e = process.env;
  return computeIntegrationRows({
    googleAdsToken: has(e.GOOGLE_ADS_DEVELOPER_TOKEN),
    googleAdsCustomer: has(e.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
    googleOAuth: has(e.GOOGLE_CLIENT_ID) && has(e.GOOGLE_CLIENT_SECRET),
    gemini: has(e.GEMINI_API_KEY),
    resend: has(e.RESEND_API_KEY),
    cron: has(e.CRON_SECRET),
    firestore: has(e.FIREBASE_SERVICE_ACCOUNT) || has(e.GOOGLE_APPLICATION_CREDENTIALS),
    localDb: e.LOCAL_DB === "true",
    devAuth: e.DEV_AUTH === "true",
    lighttrack: has(e.LIGHTTRACK_URL) && has(e.LIGHTTRACK_KEY),
    social: has(e.META_APP_ID) || has(e.LINKEDIN_CLIENT_ID),
    leonardo: has(e.LEONARDO_API_KEY),
    adsLinked: has(project.adsCustomerId),
  });
}
