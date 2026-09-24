/** Project birth — the ONE way a project comes into existence with its day-one data.
 *
 *  Three callers used to each decide what "a new project" means: POST /api/projects,
 *  POST /api/sken/redeem, and the /onboard skill's scripts/outreach/apply-onboarding.mjs.
 *  They had drifted — the activity entry was fatal in one route and best-effort in the
 *  other, and the script created projects with no starter catalog at all. Every one of
 *  them now calls this.
 *
 *  Contract:
 *   - the project row is the only part that may fail the call. `createProject`
 *     throwing propagates, and nothing is seeded for a project that does not exist;
 *   - the starter catalog and the activity entry are best-effort AND REPORTED
 *     (`catalogSeeded`, `activityLogged`), never thrown. Past `createProject` the
 *     project exists, so a hiccup there must not turn it into a 500 that the client
 *     re-submits into a second project;
 *   - the caller names its own activity line (the in-app create and the scan redeem
 *     read differently in the feed) and may pin the offering nature; otherwise the
 *     type's default nature seeds the catalog.
 *
 *  `activityLogged` means "the log call returned". emitProjectActivity already logs
 *  and swallows its own store failures, so `false` here means the helper itself broke
 *  its contract. It is still reported rather than trusted.
 *
 *  Server-only by its imports (the stores). */
import { createProject } from "@/lib/projects/store";
import type { NewProjectInput, Project } from "@/lib/projects/types";
import { saveOfferings } from "@/lib/catalog/store";
import { defaultNatureFor, starterCatalog } from "@/lib/catalog/starter";
import type { OfferingNature } from "@/lib/catalog/offering";
import { emitProjectActivity } from "@/lib/activity/emit";

export interface ProvisionOptions {
  /** The activity-feed title for the creation, e.g. "Projekt vytvořen". */
  activityTitle: string;
  /** Offering nature for the starter catalog; defaults to the type's own. */
  nature?: OfferingNature;
  /** Clock for the starter catalog's timestamps (tests). */
  now?: string;
}

export interface ProvisionResult {
  project: Project;
  /** false when the starter-catalog write failed; modules then fall back to the seed. */
  catalogSeeded: boolean;
  /** false when the activity entry could not be recorded. */
  activityLogged: boolean;
}

export async function provisionProject(
  uid: string,
  input: NewProjectInput,
  opts: ProvisionOptions
): Promise<ProvisionResult> {
  const project = await createProject(uid, input);

  let catalogSeeded = true;
  try {
    const nature = opts.nature ?? defaultNatureFor(project.type);
    await saveOfferings(
      uid,
      project.id,
      starterCatalog(project.id, project.type, nature, opts.now ?? new Date().toISOString())
    );
  } catch {
    catalogSeeded = false;
  }

  let activityLogged = true;
  try {
    await emitProjectActivity(uid, project.id, {
      kind: "update",
      module: "nastaveni",
      severity: "success",
      title: opts.activityTitle,
      detail: project.name,
      actor: "Vy",
    });
  } catch {
    activityLogged = false;
  }

  return { project, catalogSeeded, activityLogged };
}
