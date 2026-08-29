/** Applying a website-scan profile to a project — extracted verbatim from the
 *  POST /api/projects/[id]/onboarding handler so it has exactly ONE implementation.
 *
 *  Why it moved: the public `/sken` path (WP W2-B) has to seed a brand-new project
 *  from an anonymous visitor's scan the moment they sign in, and the only correct
 *  definition of "seeded like the in-app apply would" was 60 lines of route body.
 *  A second copy there would have drifted on the first change to either — and the
 *  two halves that matter (competitors MERGE, never replace; the keyword seed is
 *  idempotent per tenant) are precisely the ones a copy gets wrong.
 *
 *  Contract, unchanged from the route it came from:
 *   - the profile is already SANITIZED (sanitizeScanProfile) — this function never
 *     touches the wire;
 *   - competitor suggestions MERGE into the stored set, so re-applying a scan can
 *     never wipe a curated list, and the outcome is REPORTED rather than swallowed;
 *   - the keyword seed is best-effort and skipped when a scan-originated list
 *     already exists, so re-applying never duplicates it;
 *   - onboarding state is saved exactly ONCE, with `extra` folded into the same
 *     write (the route's `dismissed` flag rides that way).
 *
 *  Server-only by its imports (the stores). Takes `Pick<Project, "id">` rather than
 *  a whole Project because the project id is genuinely all it needs — the tenant
 *  for the keyword list is resolved from (uid, projectId), not from the record. */
import type { Project } from "@/lib/projects/types";
import type { OnboardingScanProfile, OnboardingState } from "./types";
import { getOnboarding, saveOnboarding } from "./store";
import { getCompetitors, saveCompetitors } from "@/lib/competitors/store";
import { mergeScanSuggestions } from "@/lib/competitors/merge";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listKeywordLists, saveKeywordList } from "@/lib/keywords/store";
import { SCAN_LIST_SEED, SCAN_LIST_NAME, scanKeywordsToSaved, shouldSeedScanList } from "./seed";

/** Non-fatal outcome of the competitor merge, echoed on the route's `{ok:true}`
 *  envelope so a failed/partial re-seed is visible instead of swallowed. Coded
 *  (kebab-case, per route-utils' catalog) — the client maps the code to its own
 *  localized copy, mirroring how the catalog sync surfaces its truncation. */
export interface ApplyCompetitorsOutcome {
  suggested?: number;
  skipped?: number;
  warning?: { code: "competitors-truncated"; dropped: number } | { code: "competitors-merge-failed" };
}

export interface ApplyScanOutcome {
  /** the onboarding state that was persisted */
  state: OnboardingState;
  /** present only when the scan carried competitor names */
  competitors?: ApplyCompetitorsOutcome;
}

/** Merge the scan's competitor suggestions into the stored set — never replace it.
 *  Best-effort (a competitors-store hiccup must not fail the apply) but no longer
 *  INVISIBLE: the outcome comes back to the caller. */
async function seedCompetitors(
  projectId: string,
  names: string[],
  now: string
): Promise<ApplyCompetitorsOutcome> {
  try {
    const stored = await getCompetitors(projectId);
    const merged = mergeScanSuggestions(stored?.competitors ?? [], names);
    if (!merged.unchanged) {
      await saveCompetitors(projectId, { competitors: merged.competitors, updatedAt: now });
    }
    return {
      suggested: merged.added,
      skipped: merged.skipped,
      ...(merged.dropped > 0 ? { warning: { code: "competitors-truncated" as const, dropped: merged.dropped } } : {}),
    };
  } catch {
    return { warning: { code: "competitors-merge-failed" as const } };
  }
}

/** Seed a scan-tagged keyword list from the scan's keywords — tenant-scoped, the
 *  same tenant the keyword-lists route resolves (lists are per-tenant, onboarding is
 *  per-project). Idempotent: skipped when a scan-originated list already exists.
 *  Best-effort — a keyword-store hiccup never fails the apply. */
async function seedKeywordList(uid: string, projectId: string, profile: OnboardingScanProfile): Promise<void> {
  try {
    const tenant = await resolveTenant(uid, projectId);
    const existing = await listKeywordLists(tenant);
    if (!shouldSeedScanList(existing.map((l) => l.seed), profile.keywords.length)) return;
    const keywords = scanKeywordsToSaved(profile.keywords, profile.businessName);
    if (keywords.length === 0) return;
    await saveKeywordList(tenant, {
      name: SCAN_LIST_NAME,
      seed: SCAN_LIST_SEED,
      source: "sample",
      keywords,
    });
  } catch {
    /* best-effort seeding */
  }
}

/** Persist the scan profile on the project AND seed everything grounded modules
 *  read from it. One onboarding write, whatever else happens. */
export async function applyScanToProject(
  uid: string,
  project: Pick<Project, "id">,
  profile: OnboardingScanProfile,
  opts: { now?: string; extra?: Partial<OnboardingState> } = {}
): Promise<ApplyScanOutcome> {
  const now = opts.now ?? new Date().toISOString();

  const existing = await getOnboarding(project.id).catch(() => null);
  const state: OnboardingState = {
    ...(existing ?? {}),
    ...(opts.extra ?? {}),
    scan: { ...profile, appliedAt: now },
    scanApplied: true,
    updatedAt: now,
  };

  const competitors =
    profile.competitors.length > 0 ? await seedCompetitors(project.id, profile.competitors, now) : undefined;

  if (profile.keywords.length > 0) await seedKeywordList(uid, project.id, profile);

  await saveOnboarding(project.id, state);
  return { state, ...(competitors ? { competitors } : {}) };
}
