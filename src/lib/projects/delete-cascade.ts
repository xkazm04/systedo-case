/** Project-deletion cascade — the single fan-out that scrubs EVERY per-project
 *  store when a workspace is deleted. `deleteProject` (store.ts) removes only the
 *  `projects` doc; a project also owns ~19 satellite stores (metrics, catalog,
 *  twin, onboarding, …) plus, in the cloud, its tenant-keyed Firestore data
 *  (campaigns / reports / series / snapshots / activity under `tenants/{key}`).
 *  Left behind, that data is orphaned — invisible, un-billable to delete later,
 *  and a privacy liability.
 *
 *  Design: every store is one entry in `PROJECT_STORE_DELETERS`, so adding a store
 *  is a one-line change here (the registration point). Each delete runs
 *  best-effort and independently — one store throwing never aborts the rest — and
 *  the per-store outcome is collected so the DELETE route can report what was
 *  cleaned vs. what failed. Server-only.
 *
 *  Backends: the store deleters dispatch to sqlite (LOCAL_DB) or Firestore exactly
 *  like every other call site. The `tenants/{key}` scrub on top of them runs on BOTH
 *  backends — `recursiveDelete` in the cloud, a bulk prefix delete over the
 *  `campaign_docs` / `tenant_docs` twins under LOCAL_DB — with firebase lazily
 *  imported so the LOCAL_DB path never pulls firebase-admin in. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import { clearReportMetrics } from "@/lib/report-metrics/store";
import { clearLocalSignals } from "@/lib/local-signals/store";
import { clearCostModel } from "@/lib/cost-model/store";
import { clearCompetitors } from "@/lib/competitors/store";
import { clearOrganicChannels } from "@/lib/organic-channels/store";
import { clearDiagnoses } from "@/lib/diagnoses/store";
import { clearRecaps } from "@/lib/recaps/store";
import { clearAnnotations } from "@/lib/annotations/store";
import { clearExperiments } from "@/lib/lp-exp/store";
import { clearTwin } from "@/lib/twin/store";
import { clearLeadImports } from "@/lib/lead-quality/store";
import { clearProjectLeads } from "@/lib/leads/store";
import { clearOnboarding } from "@/lib/onboarding/store";
import { deleteCatalog } from "@/lib/catalog/store";
import { deleteProjectState } from "@/lib/project-state/store";
import { deleteConnection } from "@/lib/inventory/connection-store";
import { clearProjectGoal } from "@/lib/goals/store";
import { clearInventoryPlanState } from "@/lib/inventory/plan-store";
import { clearFinanceInputs } from "@/lib/profit/finance-inputs/store";
import { clearArchive } from "@/lib/twin/archive-store";
import { buildTenantKey } from "@/lib/campaigns/store-keys";

/** One registered per-project store. `delete` takes both keys; project-scoped
 *  (Family A) stores ignore `userId`, per-(user, project) stores (Family B) use it. */
export interface ProjectStoreDeleter {
  /** stable, human-readable id surfaced in the DELETE response + logs */
  name: string;
  delete: (projectId: string, userId: string) => Promise<void>;
}

/** THE registration point. A new per-project store adds exactly one line here and
 *  the deletion cascade covers it automatically. Keep `name` stable — it is the id
 *  the DELETE response and the fixture test assert on. */
export const PROJECT_STORE_DELETERS: ProjectStoreDeleter[] = [
  { name: "report-metrics", delete: (p) => clearReportMetrics(p) },
  { name: "local-signals", delete: (p) => clearLocalSignals(p) },
  { name: "cost-model", delete: (p) => clearCostModel(p) },
  { name: "competitors", delete: (p) => clearCompetitors(p) },
  { name: "organic-channels", delete: (p) => clearOrganicChannels(p) },
  { name: "diagnoses", delete: (p) => clearDiagnoses(p) },
  { name: "recaps", delete: (p) => clearRecaps(p) },
  { name: "annotations", delete: (p) => clearAnnotations(p) },
  { name: "lp-experiments", delete: (p) => clearExperiments(p) },
  { name: "twin", delete: (p) => clearTwin(p) },
  { name: "twin-archive", delete: (p) => clearArchive(p) },
  { name: "project-goal", delete: (p) => clearProjectGoal(p) },
  { name: "inventory-plan", delete: (p) => clearInventoryPlanState(p) },
  { name: "finance-inputs", delete: (p) => clearFinanceInputs(p) },
  { name: "lead-imports", delete: (p) => clearLeadImports(p) },
  // The CRM lead ENTITY layer (contacts + raw events + timelines). Row-based, so
  // this wipes three tables/subcollections rather than one blob — and it holds the
  // most sensitive data in the product, which makes registering it non-optional.
  { name: "leads", delete: (p) => clearProjectLeads(p) },
  { name: "onboarding", delete: (p) => clearOnboarding(p) },
  { name: "catalog", delete: (p, u) => deleteCatalog(u, p) },
  { name: "project-state", delete: (p, u) => deleteProjectState(u, p) },
  { name: "warehouse-connection", delete: (p, u) => deleteConnection(u, p) },
];

/** The result of one store's delete — `ok:false` carries the error message so the
 *  route can surface a partial-failure without a stack trace. */
export interface StoreOutcome {
  name: string;
  ok: boolean;
  error?: string;
}

export interface CascadeResult {
  /** names of stores (and the tenant scrub) that deleted cleanly */
  cleaned: string[];
  /** stores that threw — the project doc is still removed, but this data lingers */
  failed: StoreOutcome[];
  /** every outcome in registration order (cleaned + failed), for logging */
  outcomes: StoreOutcome[];
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Scrub the project's tenant-keyed data: the account-agnostic base tenant plus
 *  every account-scoped tenant (the two suffix shapes `buildTenantKey` produces for
 *  a project — with and without a customerId). BOTH backends do real work here.
 *
 *  This step used to early-return under LOCAL_DB on the rationale that the
 *  per-domain sqlite tables the store deleters hit already covered it. That was
 *  FALSE for the two generic tenant-keyed document twins — `campaign_docs` (synced
 *  campaigns / series / reports / snapshots) and `tenant_docs` (saved keyword lists,
 *  the winning-pattern library, social posts + inbox). No store deleter owns those
 *  tables and their backends expose only per-doc deletes, so a deleted project's
 *  data survived locally while Firestore's `recursiveDelete` cleared it. Each local
 *  twin now exports a bulk `deleteAllForTenant`, so the two backends genuinely match.
 *
 *  Backend asymmetry that remains, deliberately: the cloud path must ENUMERATE the
 *  account-scoped tenant keys (Firestore has no prefix delete) and can only see
 *  currently-connected accounts; the sqlite path sweeps the whole `{base}_…` key
 *  prefix in one statement, so it also reaches tenants left by a since-disconnected
 *  account. Best-effort either way — a store hiccup is reported, never thrown, and
 *  firebase-admin is still never imported on the LOCAL_DB path. */
async function deleteTenantData(userId: string, projectId: string): Promise<StoreOutcome> {
  const name = "tenant-data";
  if (LOCAL_DB) {
    try {
      const base = buildTenantKey(userId, projectId);
      const [campaignDocs, tenantDocsLocal] = await Promise.all([
        import("@/lib/campaigns/store/local-docs"),
        import("@/lib/tenant-docs/local"),
      ]);
      campaignDocs.deleteAllForTenant(base);
      tenantDocsLocal.deleteAllForTenant(base);
      return { name, ok: true };
    } catch (err) {
      return { name, ok: false, error: errText(err) };
    }
  }
  try {
    const [{ firestore }, { listConnectedAccounts }] = await Promise.all([
      import("@/lib/firebase"),
      import("@/lib/campaigns/connection"),
    ]);
    // Enumerate every tenant key this project could have written under:
    //  • base                       → account-agnostic (activity, social, reports)
    //  • base + each customerId     → account-scoped (campaigns, series, snapshots)
    const keys = new Set<string>([buildTenantKey(userId, projectId)]);
    try {
      const { accounts } = await listConnectedAccounts(userId);
      for (const a of accounts) keys.add(buildTenantKey(userId, projectId, a.customerId));
    } catch {
      /* couldn't list accounts — still scrub the base tenant below */
    }
    // recursiveDelete removes the tenant root doc AND all its subcollections
    // (campaigns / series / reports / snapshots / activity) in one pass.
    for (const key of keys) {
      await firestore.recursiveDelete(firestore.collection("tenants").doc(key));
    }
    return { name, ok: true };
  } catch (err) {
    return { name, ok: false, error: errText(err) };
  }
}

/** The name the tenant-keyed scrub reports under. Not a store deleter (it has no
 *  registry entry — it is the cross-cutting `tenants/{key}` sweep), but it is one of
 *  the units a caller can re-run, so it needs a stable id like the rest. */
export const TENANT_DATA_UNIT = "tenant-data";

/** EVERY cleanup unit a project has, derived from the registry — the registered store
 *  deleters plus the tenant scrub. The integrity sweep (./orphan-sweep) builds its
 *  work list from THIS, never from a second hand-maintained list, so a store added to
 *  `PROJECT_STORE_DELETERS` is swept as automatically as it is cascaded. */
export function projectCleanupUnits(): string[] {
  return [...PROJECT_STORE_DELETERS.map((d) => d.name), TENANT_DATA_UNIT];
}

/** Fan out best-effort deletes across the requested cleanup units. One failure never
 *  aborts the rest; the per-unit outcomes are collected and returned so the caller can
 *  report + log them. Does NOT remove the `projects` doc itself — the route does that
 *  as the primary operation after this scrub (so a satellite hiccup can't strand the
 *  workspace entry, and the workspace is only gone once its data is).
 *
 *  `only` narrows the run to the named units — how a RESUMED cleanup re-runs exactly
 *  the stores that failed the first time, without a second list and without touching
 *  the ones that already succeeded (every deleter is idempotent, but re-running 19 of
 *  them to fix 1 is noise). Omitted → every unit, which is the full cascade. Unknown
 *  names in `only` are ignored: the registry is the authority, so a stale ledger entry
 *  naming a retired store cannot resurrect it. */
export async function runProjectCleanup(
  userId: string,
  projectId: string,
  only?: readonly string[]
): Promise<CascadeResult> {
  const wanted = only ? new Set(only) : null;
  const deleters = wanted
    ? PROJECT_STORE_DELETERS.filter((d) => wanted.has(d.name))
    : PROJECT_STORE_DELETERS;

  const storeOutcomes = await Promise.all(
    deleters.map(async ({ name, delete: del }): Promise<StoreOutcome> => {
      try {
        await del(projectId, userId);
        return { name, ok: true };
      } catch (err) {
        return { name, ok: false, error: errText(err) };
      }
    })
  );

  const outcomes = [...storeOutcomes];
  if (!wanted || wanted.has(TENANT_DATA_UNIT)) {
    outcomes.push(await deleteTenantData(userId, projectId));
  }

  const cleaned = outcomes.filter((o) => o.ok).map((o) => o.name);
  const failed = outcomes.filter((o) => !o.ok);

  if (failed.length > 0) {
    console.error(
      "[projects] delete cascade — partial failure",
      JSON.stringify({ projectId, failed })
    );
  }

  return { cleaned, failed, outcomes };
}

/** The full cascade: every registered store plus the tenant scrub. */
export async function deleteProjectCascade(
  userId: string,
  projectId: string
): Promise<CascadeResult> {
  return runProjectCleanup(userId, projectId);
}
