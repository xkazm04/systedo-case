/** Persist a project's onboarding state. POST applies a (user-edited) website-scan
 *  profile — saving it AND seeding the competitor set from it, so every grounded
 *  module immediately speaks the real business — and/or flips the dismissed flag.
 *  DELETE resets. Per-user, ownership-checked; the body is coerced to a clean blob.
 *  Server-only. Mirrors the organic-channels route's auth shape. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { getOnboarding, saveOnboarding, clearOnboarding } from "@/lib/onboarding/store";
import { sanitizeScanProfile } from "@/lib/onboarding/types";
import type { OnboardingState } from "@/lib/onboarding/types";
import { saveCompetitors } from "@/lib/competitors/store";
import { sanitizeCompetitors } from "@/lib/competitors/types";
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
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, code: "unauthorized", error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, code: "not-found", error: "Projekt nenalezen." }, { status: 404 });

  const body = await readJson<{ scan?: unknown; dismissed?: unknown }>(req);

  const existing = await getOnboarding(project.id).catch(() => null);
  const now = new Date().toISOString();
  const next: OnboardingState = { ...(existing ?? {}), updatedAt: now };

  if (body?.scan !== undefined) {
    const profile = sanitizeScanProfile(body.scan);
    if (!profile) {
      return Response.json({ ok: false, code: "invalid-scan", error: "Neplatný profil ze skenu." }, { status: 422 });
    }
    next.scan = { ...profile, appliedAt: now };
    next.scanApplied = true;
    // Seed the competitor set (the highest-leverage grounding) from the confirmed
    // suggestions — best-effort, so a competitors-store hiccup never fails the apply.
    if (profile.competitors.length > 0) {
      const set = sanitizeCompetitors({ competitors: profile.competitors.map((name) => ({ name })) });
      if (set) {
        await saveCompetitors(project.id, { ...set, updatedAt: now }).catch(() => {});
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
  return Response.json({ ok: true });
}

/** Reset onboarding (drops the applied scan + flags). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, code: "unauthorized", error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, code: "not-found", error: "Projekt nenalezen." }, { status: 404 });
  await clearOnboarding(project.id);
  return Response.json({ ok: true });
}
