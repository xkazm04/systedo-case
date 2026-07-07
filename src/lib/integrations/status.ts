/** Server-only reader that turns the real environment + live per-user/project
 *  probes into integration-readiness rows. Kept apart from compute.ts (which stays
 *  pure and testable) so this file — which touches process.env + Firestore — never
 *  leaks into a client bundle. Env presence answers "is the platform configured";
 *  the best-effort probes answer "is THIS user/project actually connected" (a
 *  validated BYOM key, a saved warehouse feed, a linked Ads account). Each probe
 *  degrades to false on any error so the readout never throws. */
import "server-only";
import type { Project } from "@/lib/projects/types";
import { computeIntegrationRows, type IntegrationRow } from "./compute";
import { getPublicByomConfig } from "@/lib/llm/keys/store";
import { getConnection } from "@/lib/inventory/connection-store";
import { getAdsConnection } from "@/lib/campaigns/connection";

const has = (v: string | undefined): boolean => typeof v === "string" && v.trim() !== "";

/** A vendor key that validated and hasn't since errored. */
async function probeByomValidated(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const cfg = await getPublicByomConfig(userId);
    return cfg.keys.some((k) => k.lastValidatedAt && !k.lastError);
  } catch {
    return false;
  }
}

async function probeWarehouse(userId: string | null, projectId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    return (await getConnection(userId, projectId)) !== null;
  } catch {
    return false;
  }
}

async function probeAdsLinked(userId: string | null, project: Project): Promise<boolean> {
  if (has(project.adsCustomerId)) return true;
  if (!userId) return false;
  try {
    return Boolean((await getAdsConnection(userId))?.customerId);
  } catch {
    return false;
  }
}

export async function integrationStatus(project: Project, userId: string | null): Promise<IntegrationRow[]> {
  const e = process.env;
  const [byomValidated, warehouse, adsLinked] = await Promise.all([
    probeByomValidated(userId),
    probeWarehouse(userId, project.id),
    probeAdsLinked(userId, project),
  ]);
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
    adsLinked,
    byomValidated,
    warehouse,
  });
}
