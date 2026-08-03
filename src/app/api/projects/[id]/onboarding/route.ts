/** Persist a project's onboarding state. POST applies a (user-edited) website-scan
 *  profile — saving it AND seeding the competitor set from it, so every grounded
 *  module immediately speaks the real business — and/or flips the dismissed flag.
 *  DELETE resets. Per-user, ownership-checked; the body is coerced to a clean blob.
 *  Server-only. Mirrors the organic-channels route's auth shape. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { getOnboarding, saveOnboarding, clearOnboarding } from "@/lib/onboarding/store";
import { sanitizeScanProfile } from "@/lib/onboarding/types";
import type { OnboardingState } from "@/lib/onboarding/types";
import { getCompetitors, saveCompetitors } from "@/lib/competitors/store";
import { mergeScanSuggestions } from "@/lib/competitors/merge";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listKeywordLists, saveKeywordList } from "@/lib/keywords/store";
import {
  SCAN_LIST_SEED,
  SCAN_LIST_NAME,
  scanKeywordsToSaved,
  shouldSeedScanList,
} from "@/lib/onboarding/seed";
import { readJson } from "@/lib/api/route-utils";

/** Stable machine codes echoed alongside the (Czech) server `error` text. The client
 *  never renders these Czech strings — it maps the `code` to its own localized copy
 *  (mirroring the CampaignError key-or-text pattern), so the response is bilingual on
 *  the surface without server-side i18n. `error` stays as a human-readable fallback. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok", code: true });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  const body = await readJson<{ scan?: unknown; dismissed?: unknown }>(req);

  const existing = await getOnboarding(project.id).catch(() => null);
  const now = new Date().toISOString();
  const next: OnboardingState = { ...(existing ?? {}), updatedAt: now };

  /** Non-fatal outcome of the competitor merge, echoed on the `{ok:true}` envelope so a
   *  failed/partial re-seed is visible instead of swallowed by a bare `.catch(() => {})`.
   *  Coded (kebab-case, per route-utils' catalog) — the client maps the code to its own
   *  localized copy, mirroring how the catalog sync surfaces its truncation. */
  let competitorsResult:
    | {
        suggested?: number;
        skipped?: number;
        warning?: { code: "competitors-truncated"; dropped: number } | { code: "competitors-merge-failed" };
      }
    | undefined;

  if (body?.scan !== undefined) {
    const profile = sanitizeScanProfile(body.scan);
    if (!profile) {
      return Response.json({ ok: false, code: "invalid-scan", error: "Neplatný profil ze skenu." }, { status: 422 });
    }
    next.scan = { ...profile, appliedAt: now };
    next.scanApplied = true;
    // MERGE the scan's competitor suggestions into the stored set — never replace it.
    // This used to be an unconditional saveCompetitors(), so re-applying a scan wiped
    // whatever the user had curated and fed the unreviewed guesses straight into the
    // recap/social LLM grounding. Now: existing entries are untouchable, new names land
    // as UNCONFIRMED `scan` entries (excluded from grounding until the user keeps them
    // in the competitor editor), and the cap can only ever cost a suggestion.
    // Best-effort still — a competitors-store hiccup must not fail the onboarding apply —
    // but no longer INVISIBLE: the outcome is reported back in the response.
    if (profile.competitors.length > 0) {
      try {
        const stored = await getCompetitors(project.id);
        const merged = mergeScanSuggestions(stored?.competitors ?? [], profile.competitors);
        if (!merged.unchanged) {
          await saveCompetitors(project.id, { competitors: merged.competitors, updatedAt: now });
        }
        competitorsResult = {
          suggested: merged.added,
          skipped: merged.skipped,
          ...(merged.dropped > 0
            ? { warning: { code: "competitors-truncated" as const, dropped: merged.dropped } }
            : {}),
        };
      } catch {
        competitorsResult = { warning: { code: "competitors-merge-failed" as const } };
      }
    }

    // Seed a scan-tagged keyword list from the scan's keywords — tenant-scoped, the
    // same tenant the keyword-lists route resolves (lists are per-tenant, onboarding
    // is per-project). Idempotent: skip when a scan-originated list already exists, so
    // re-applying never duplicates it. Best-effort — a keyword-store hiccup never
    // fails the apply.
    if (profile.keywords.length > 0) {
      try {
        const tenant = await resolveTenant(uid, project.id);
        const existing = await listKeywordLists(tenant);
        if (shouldSeedScanList(existing.map((l) => l.seed), profile.keywords.length)) {
          const keywords = scanKeywordsToSaved(profile.keywords, profile.businessName);
          if (keywords.length > 0) {
            await saveKeywordList(tenant, {
              name: SCAN_LIST_NAME,
              seed: SCAN_LIST_SEED,
              source: "sample",
              keywords,
            });
          }
        }
      } catch {
        /* best-effort seeding */
      }
    }
  }

  if (typeof body?.dismissed === "boolean") next.dismissed = body.dismissed;

  await saveOnboarding(project.id, next);
  return Response.json({ ok: true, ...(competitorsResult ? { competitors: competitorsResult } : {}) });
}

/** Reset onboarding (drops the applied scan + flags). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok", code: true });
  if ("error" in g) return g.error;
  const { project } = g;
  await clearOnboarding(project.id);
  return Response.json({ ok: true });
}
