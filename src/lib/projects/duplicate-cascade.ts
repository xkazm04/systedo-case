/** Project-duplication cascade — the single fan-out that copies a project's SETUP
 *  into a fresh, independent project ("duplicate as a template"). Agencies onboard
 *  similar clients; every project otherwise starts empty except a starter catalog.
 *  The per-project SETUP stores are cleanly separable, so this mirrors the deletion
 *  cascade's registration style (see delete-cascade.ts): every copied store is one
 *  entry in `PROJECT_STORE_COPIERS`, so adding a store is a one-line change here.
 *
 *  What copies (SETUP — the reusable client scaffold):
 *   • project fields — TYPE + ACCENT are kept; domain / adsCustomerId / logoUrl are
 *     CLEARED (a new client owns its own domain, Ads account and logo). createProject
 *     naturally omits the latter two (they aren't creatable), and we pass no domain.
 *   • catalog offerings (re-homed to the new project id — see remapOffering)
 *   • cost model, competitor set, organic-channels plan + statuses
 *   • report-config white-label branding: brandName, accentColor, and the
 *     ClientProfile (tenant-keyed — both tenants resolved via resolveTenant)
 *
 *  What is EXPLICITLY EXCLUDED (accumulated OPERATING data, never a template — a
 *  fresh client starts clean, and credentials must NEVER be copied):
 *   • report-metrics (synced/derived performance), local-signals (imported ranks)
 *   • diagnoses, recaps, annotations, lp-experiments
 *   • twin (trained voice + inbox), lead imports, onboarding scan state
 *   • warehouse connection (credentials — NEVER copy)
 *   • project-state blobs (per-module working state)
 *   • the catalog CHANGE LEDGER (a history of the SOURCE project's writes — operating
 *     data by this list's rule, and meaningless against a catalog that was just re-homed)
 *   • outbound webhook endpoints + their delivery log (signing SECRETS — never copy;
 *     and a duplicate must not start POSTing to the source client's receiver)
 *   • /go short links + their click ledger (WP W2-A) — a public address space and the
 *     operating data measured through it; a duplicate must not inherit either
 *   • the outbound product-feed TOKEN (WP W2-D) — a capability URL is a secret ADDRESS,
 *     not setup: two projects sharing one feed URL would serve one catalog under both
 *     identities, and revoking either would silently break the other. The duplicate
 *     mints its own on first publish.
 *   • the project's tenant-keyed campaign/series/snapshot/activity data
 *
 *  Same-owner only: a duplicate is created for the SAME user, so source and target
 *  share `userId` and every copier reads + writes under it. Server-only. Each copier
 *  runs best-effort and independently — one store throwing never aborts the rest —
 *  and reuses the store's own read/save functions (never a raw doc copy that would
 *  bypass their sanitizers). */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import { createProject, getProject } from "./store";
import type { Project } from "./types";
import { listOfferings, saveOfferings } from "@/lib/catalog/store";
import { getCostModel, saveCostModel } from "@/lib/cost-model/store";
import { getCompetitors, saveCompetitors } from "@/lib/competitors/store";
import { getOrganicChannels, saveOrganicChannels } from "@/lib/organic-channels/store";
import type { Offering } from "@/lib/catalog/offering";

/** Re-home one offering onto the target project: point `projectId` at the new
 *  project and swap the `${projectId}:` id prefix the starter/seed uses, so two
 *  duplicated projects never share an offering identity. Ids that aren't
 *  project-prefixed (e.g. feed-imported external ids) are left intact — they're
 *  already unique and the catalog blob is project-scoped in storage. */
function remapOffering(o: Offering, src: string, dst: string): Offering {
  const prefix = `${src}:`;
  const id = o.id.startsWith(prefix) ? `${dst}:${o.id.slice(prefix.length)}` : o.id;
  return { ...o, projectId: dst, id };
}

/** One registered SETUP store the template-duplicate copies. `copy` takes the
 *  shared `userId` plus the source + target project ids. Keep `name` stable — it is
 *  the id the duplicate response and the fixture test assert on. */
export interface ProjectStoreCopier {
  name: string;
  copy: (userId: string, srcProjectId: string, dstProjectId: string) => Promise<void>;
}

/** THE registration point. A new per-project SETUP store adds exactly one line here
 *  and the duplicate covers it automatically. OPERATING-data stores (see the file
 *  header's exclusion list) are deliberately absent. */
export const PROJECT_STORE_COPIERS: ProjectStoreCopier[] = [
  {
    name: "catalog",
    copy: async (u, src, dst) => {
      const offerings = await listOfferings(u, src);
      // null → source never saved a catalog (still on the type seed); leave the
      // target on the same seed rather than persisting an empty array.
      if (offerings && offerings.length > 0) {
        await saveOfferings(u, dst, offerings.map((o) => remapOffering(o, src, dst)));
      }
    },
  },
  {
    name: "cost-model",
    copy: async (_u, src, dst) => {
      const model = await getCostModel(src);
      if (model) await saveCostModel(dst, model);
    },
  },
  {
    name: "competitors",
    copy: async (_u, src, dst) => {
      const set = await getCompetitors(src);
      if (set) await saveCompetitors(dst, set);
    },
  },
  {
    name: "organic-channels",
    copy: async (_u, src, dst) => {
      const state = await getOrganicChannels(src);
      if (state) await saveOrganicChannels(dst, state);
    },
  },
  {
    name: "report-config",
    copy: async (u, src, dst) => {
      // Tenant-keyed white-label branding. Cloud-only: the report-config store is
      // Firestore-backed (no LOCAL_DB twin), so under LOCAL_DB there is nothing to
      // copy and firebase-admin is never imported — mirroring the deletion
      // cascade's cloud-only tenant scrub. Both tenants are resolved the same way
      // the report-config route does (resolveTenant), so the copy reads/writes the
      // exact keys the app uses. adsCustomerId is per-user (not per-project) so the
      // source and target tenants share the same account suffix for one user.
      if (LOCAL_DB) return;
      const [{ resolveTenant }, { getReportConfig, setReportConfig }] = await Promise.all([
        import("@/lib/campaigns/connector"),
        import("@/lib/campaigns/report-config"),
      ]);
      const [srcTenant, dstTenant] = await Promise.all([
        resolveTenant(u, src),
        resolveTenant(u, dst),
      ]);
      const cfg = await getReportConfig(srcTenant);
      // Copy the white-label + identity fields only; recipients/cadence are delivery
      // settings for the source's own client and reset to the defaults on the target.
      await setReportConfig(dstTenant, {
        brandName: cfg.brandName,
        accentColor: cfg.accentColor,
        recipients: [],
        cadence: "off",
        clientProfile: cfg.clientProfile,
      });
    },
  },
];

/** The result of one store's copy — `ok:false` carries the error message so the
 *  route can surface a partial-failure without a stack trace. */
export interface CopyOutcome {
  name: string;
  ok: boolean;
  error?: string;
}

export interface DuplicateResult {
  /** the freshly created, independent target project */
  project: Project;
  /** names of SETUP stores that copied cleanly (or were empty at the source) */
  copied: string[];
  /** stores that threw — the target still exists, this setup just wasn't carried */
  failed: CopyOutcome[];
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Duplicate `sourceId` into a fresh project named `name`, owned by the same user.
 *  Returns null when the source isn't the user's (ownership). Creates the target
 *  first (type + accent kept, domain/logo/Ads cleared), then fans the SETUP copiers
 *  out best-effort. Every copier is isolated: one throwing is quarantined into
 *  `failed` while the rest still run. */
export async function duplicateProject(
  userId: string,
  sourceId: string,
  name: string
): Promise<DuplicateResult | null> {
  const source = await getProject(userId, sourceId);
  if (!source) return null;

  // Fresh project: keep type + accent, CLEAR domain (pass none). adsCustomerId +
  // logoUrl aren't part of NewProjectInput, so they're absent on the new project.
  const target = await createProject(userId, {
    name: name.trim() || source.name,
    type: source.type,
    accentColor: source.accentColor,
  });

  const outcomes = await Promise.all(
    PROJECT_STORE_COPIERS.map(async ({ name: storeName, copy }): Promise<CopyOutcome> => {
      try {
        await copy(userId, sourceId, target.id);
        return { name: storeName, ok: true };
      } catch (err) {
        return { name: storeName, ok: false, error: errText(err) };
      }
    })
  );

  const copied = outcomes.filter((o) => o.ok).map((o) => o.name);
  const failed = outcomes.filter((o) => !o.ok);

  if (failed.length > 0) {
    console.error(
      "[projects] duplicate cascade — partial failure",
      JSON.stringify({ sourceId, targetId: target.id, failed })
    );
  }

  return { project: target, copied, failed };
}
