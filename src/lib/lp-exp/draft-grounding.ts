/** W3-B — server-side grounding for the `lp-variant-draft` tool.
 *
 *  The caller names WHICH experiment to draft copy for; everything the prompt then
 *  contains is rebuilt here from the OWNED project — the experiment's real cluster and
 *  its real arm list (labels included), the brand name, and the shared brand fact
 *  block. A tampered body can therefore not draft copy for another tenant's
 *  experiment, invent an arm the experiment does not have, or put a brand context the
 *  project never had into the prompt.
 *
 *  ABOUT THE ARM IDS IN THE DRAFT. They are POSITIONAL PLACEHOLDERS (`arm-0`, `arm-1`)
 *  for an experiment that has never been published, and the experiment's REAL minted
 *  ids once it has. That is deliberate on two counts: a freshly minted random id per
 *  draft would bust the /api/ai response cache on every identical re-run (the id is
 *  part of the hashed request), and the identity that ends up on a counter row is
 *  minted by the PUBLISH route from the experiment's own state, positionally — never
 *  taken from a draft. The placeholder's only job is to let the model keep the arms
 *  apart in one response.
 *
 *  Tenancy is the same demo-public / owner-only triad the other /api/ai grounding
 *  resolvers use. Server-only. */
import "server-only";
import type { LpVariantDraftRequest, LpVariantDraftSeed } from "@/lib/ai-types";
import type { Project } from "@/lib/projects/types";
import { getProject } from "@/lib/projects/store";
import { isDemoProjectId } from "@/lib/projects/demo";
import { demoProjectById } from "@/lib/demo/projects";
import { promptSafeName } from "@/lib/projects/name";
import { loadProjectCatalogWithSource } from "@/lib/catalog/load";
import { deriveBrandContext } from "@/lib/brand/context";
import { experimentsForProject } from "./sample";
import { listExperiments } from "./store";
import { VARIANT_MAX } from "./types";

export interface ResolvedLpDraft {
  request: LpVariantDraftRequest;
  /** true when the grounding rests on the illustrative sample (a seeded experiment,
   *  or a catalogue that is still the demo seed) */
  sample: boolean;
  /** the effective cache-tenancy key (the project the grounding was read for) */
  keyId: string;
}

/** The demo-public / owner-only project triad. A demo id is public (fixture only,
 *  never a tenant read); a real id must belong to the caller. */
async function accessProject(
  projectId: string | undefined,
  userId: string | null
): Promise<Project | null> {
  if (!projectId) return null;
  if (isDemoProjectId(projectId)) return demoProjectById(projectId) ?? null;
  if (!userId) return null;
  return getProject(userId, projectId);
}

/** The placeholder identity for an arm that has never been published. Positional and
 *  stable, so an identical re-draft hashes to the same cache key. */
export function draftArmId(variantArmId: string | undefined, index: number): string {
  return variantArmId || `arm-${index}`;
}

/** The `lp-variant-draft` mode's grounding resolver: resolve the project for the
 *  caller, find the named experiment among its OWN experiments (persisted first, the
 *  seeded sample second — the same live-over-sample seam the module reads through),
 *  and rebuild the request from it. `null` when nothing resolves, which the mode turns
 *  into the shared "nothing to write about" 422. */
export async function resolveLpDraft(
  projectId: string | undefined,
  userId: string | null,
  experimentId: string
): Promise<ResolvedLpDraft | null> {
  const project = await accessProject(projectId, userId);
  if (!project || !experimentId.trim()) return null;

  const persisted = await listExperiments(project.id);
  const fromStore = persisted.find((e) => e.id === experimentId);
  // A project with no persisted experiments still SHOWS the seeded sample, and an
  // operator drafting from that view is drafting for a real (if illustrative)
  // experiment. Falling back to it keeps the panel usable before the first save,
  // and the `sample` flag below tells the prompt not to write it up as fact.
  const experiment =
    fromStore ?? experimentsForProject(project).find((e) => e.id === experimentId);
  if (!experiment || experiment.variants.length === 0) return null;

  const { offerings, source } = await loadProjectCatalogWithSource(project);
  const brand = promptSafeName(project.name) || project.name;

  const arms: LpVariantDraftSeed[] = experiment.variants
    .slice(0, VARIANT_MAX)
    .map((v, i) => ({ armId: draftArmId(v.armId, i), label: v.label }));

  const request: LpVariantDraftRequest = {
    cluster: experiment.cluster,
    brand,
    arms,
  };
  const brandContext = deriveBrandContext(project, offerings);
  if (brandContext) request.brandContext = brandContext;

  return {
    request,
    // Either half being illustrative makes the whole grounding illustrative: a seeded
    // experiment has no real traffic behind it, and a seeded catalogue has no real
    // sortiment behind it. The prompt hedges rather than writing either up as fact.
    sample: !fromStore || source === "sample",
    keyId: project.id,
  };
}
