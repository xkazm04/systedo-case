/** Server-only reader that turns the real environment + live per-user/project
 *  probes into integration-readiness rows. Kept apart from compute.ts (which stays
 *  pure and testable) so this file — which touches process.env + Firestore — never
 *  leaks into a client bundle. Env presence answers "is the platform configured";
 *  the probes answer "is THIS user/project actually connected, and is that
 *  connection HEALTHY" (a validated-and-not-stale BYOM key, a saved warehouse feed,
 *  a linked Ads account, linked social accounts, a stored Sklik token, a published
 *  microsite). Each probe degrades to its safest value on any error so the readout
 *  never throws — and a failed probe never upgrades a row to "connected". */
import "server-only";
import type { Project } from "@/lib/projects/types";
import {
  bestByomHealth,
  byomKeyHealth,
  computeIntegrationRows,
  type ByomKeyHealth,
  type IntegrationRow,
} from "./compute";
import { getPublicByomConfig } from "@/lib/llm/keys/store";
import { isByomValidationStale } from "@/lib/llm/keys/types";
import { getConnection } from "@/lib/inventory/connection-store";
import { getAdsConnection } from "@/lib/campaigns/connection";
import { getSklikConnection } from "@/lib/campaigns/sklik-connection";
import { listAccounts, providerConfigured, socialConfigured } from "@/lib/social/connection";
import { getLocalSignals } from "@/lib/local-signals/store";
import { listContacts } from "@/lib/leads/store";
import { getWebhookConfig } from "@/lib/outbound/config-store";

const has = (v: string | undefined): boolean => typeof v === "string" && v.trim() !== "";

/** BYOM health under the SAME rules the settings page shows the user: a stamp older
 *  than BYOM_VALIDATION_STALE_DAYS stops being evidence, and a key with recorded
 *  incidents is not healthy. Previously this accepted any `lastValidatedAt &&
 *  !lastError`, so the board said "Připojeno" about a key nastaveni called
 *  "Ověřeno dávno". */
async function probeByomHealth(userId: string | null): Promise<ByomKeyHealth> {
  if (!userId) return "none";
  try {
    const cfg = await getPublicByomConfig(userId);
    return bestByomHealth(
      cfg.keys.map((k) =>
        byomKeyHealth({
          present: true,
          lastValidatedAt: k.lastValidatedAt,
          lastError: k.lastError,
          incidents: k.incidents?.length ?? 0,
          stale: isByomValidationStale(k.lastValidatedAt),
        })
      )
    );
  } catch {
    return "none";
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

/** Has this project imported a Google Business Profile section into local-signals? */
async function probeGbpImported(projectId: string): Promise<boolean> {
  try {
    const signals = await getLocalSignals(projectId);
    return Boolean(signals?.gbp && signals.gbp.rows.length > 0);
  } catch {
    return false;
  }
}

/** Linked social accounts, split real vs demo. `demo` is the account's own stored
 *  flag, so a demo connection stays a demo connection here too; "real" additionally
 *  requires THIS platform's provider credentials (providerConfigured), never the
 *  cross-platform OR that connection.ts explicitly warns against. */
async function probeSocial(
  userId: string | null
): Promise<{ real: boolean; demo: boolean }> {
  if (!userId) return { real: false, demo: false };
  try {
    const accounts = await listAccounts(userId);
    return {
      real: accounts.some((a) => !a.demo && providerConfigured(a.platform)),
      demo: accounts.some((a) => a.demo || !providerConfigured(a.platform)),
    };
  } catch {
    return { real: false, demo: false };
  }
}

/** Does this user have their OWN stored Sklik token — the exact record the connect
 *  card renders, so board and card cannot contradict each other. */
async function probeSklikUserToken(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    return (await getSklikConnection(userId)) !== null;
  } catch {
    return false;
  }
}

/** This project's published microsite, if any. Dynamically imported so the Firestore
 *  registry module is only loaded when the board is actually rendered. */
async function probeMicrosite(
  userId: string | null,
  projectId: string
): Promise<{ enabled: boolean; illustrative: boolean }> {
  if (!userId) return { enabled: false, illustrative: false };
  try {
    const [{ resolveTenant }, { getMicrositeForTenant }] = await Promise.all([
      import("@/lib/campaigns/connector"),
      import("@/lib/microsite"),
    ]);
    const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
    const cfg = await getMicrositeForTenant(tenant);
    if (!cfg?.enabled) return { enabled: false, illustrative: false };
    return { enabled: true, illustrative: Boolean(cfg.illustrative) };
  } catch {
    return { enabled: false, illustrative: false };
  }
}

/** Has the lead store any real contact for this project? Probed by a bounded read
 *  rather than the contact counter — the counter is an optimisation, and a project
 *  whose counter is stale must not be reported as having no ingestion. */
async function probeLeadContacts(projectId: string): Promise<boolean> {
  try {
    return (await listContacts(projectId, { limit: 1, includeErased: true })).length > 0;
  } catch {
    return false;
  }
}

/** This project's ENABLED outbound webhook endpoints, and whether any of them last
 *  failed. Degrades to "none registered" on any error — a failed probe must never
 *  upgrade the row, and must never break the board. */
async function probeWebhooks(
  userId: string | null,
  projectId: string
): Promise<{ count: number; failing: boolean }> {
  if (!userId) return { count: 0, failing: false };
  try {
    const cfg = await getWebhookConfig(userId, projectId);
    const enabled = cfg.endpoints.filter((e) => e.enabled);
    return { count: enabled.length, failing: enabled.some((e) => e.lastStatus === "failed") };
  } catch {
    return { count: 0, failing: false };
  }
}

export async function integrationStatus(project: Project, userId: string | null): Promise<IntegrationRow[]> {
  const e = process.env;
  const [byomKey, warehouse, adsLinked, gbpImported, social, sklikUserToken, microsite, leadContacts, webhooks] =
    await Promise.all([
      probeByomHealth(userId),
      probeWarehouse(userId, project.id),
      probeAdsLinked(userId, project),
      probeGbpImported(project.id),
      probeSocial(userId),
      probeSklikUserToken(userId),
      probeMicrosite(userId, project.id),
      probeLeadContacts(project.id),
      probeWebhooks(userId, project.id),
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
    leonardo: has(e.LEONARDO_API_KEY),
    adsLinked,
    byomKey,
    warehouse,
    gbpImported,
    socialReal: social.real,
    socialDemo: social.demo,
    // The coarse "could a real connection exist at all" env signal — used ONLY to
    // choose between "link an account" and "demo only", never to claim connection.
    socialCredentials: socialConfigured(),
    sklikUserToken,
    sklikEnvToken: has(e.SKLIK_API_TOKEN),
    micrositeEnabled: microsite.enabled,
    micrositeIllustrative: microsite.illustrative,
    leadContacts,
    webhooks: webhooks.count,
    webhooksFailing: webhooks.failing,
  });
}
