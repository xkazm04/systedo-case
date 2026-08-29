/** Persist a project's onboarding state. POST applies a (user-edited) website-scan
 *  profile — saving it AND seeding the competitor set from it, so every grounded
 *  module immediately speaks the real business — and/or flips the dismissed flag.
 *  DELETE resets. Per-user, ownership-checked; the body is coerced to a clean blob.
 *  Server-only. Mirrors the organic-channels route's auth shape. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { getOnboarding, saveOnboarding, clearOnboarding } from "@/lib/onboarding/store";
import { sanitizeScanProfile } from "@/lib/onboarding/types";
import type { OnboardingState } from "@/lib/onboarding/types";
// The seeding half of an apply (profile → competitor merge → keyword seed → one
// onboarding write) lives in lib/onboarding/apply so the public /sken redeem path
// seeds a claimed project through the SAME code, not a second copy of it.
import { applyScanToProject } from "@/lib/onboarding/apply";
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
  const now = new Date().toISOString();
  const dismissed = typeof body?.dismissed === "boolean" ? { dismissed: body.dismissed } : undefined;

  if (body?.scan !== undefined) {
    const profile = sanitizeScanProfile(body.scan);
    if (!profile) {
      return Response.json({ ok: false, code: "invalid-scan", error: "Neplatný profil ze skenu." }, { status: 422 });
    }
    // One write, competitor merge + keyword seed included — see lib/onboarding/apply
    // for why the seeding rules (merge-never-replace, idempotent keyword list) live
    // there rather than inline here.
    const applied = await applyScanToProject(uid, project, profile, {
      now,
      ...(dismissed ? { extra: dismissed } : {}),
    });
    return Response.json({ ok: true, ...(applied.competitors ? { competitors: applied.competitors } : {}) });
  }

  // Flags-only patch (the dismiss toggle): no scan to apply, so the state is read,
  // patched and saved right here — the same single write the apply path performs.
  const existing = await getOnboarding(project.id).catch(() => null);
  const next: OnboardingState = { ...(existing ?? {}), ...(dismissed ?? {}), updatedAt: now };
  await saveOnboarding(project.id, next);
  return Response.json({ ok: true });
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
