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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | { scan?: unknown; dismissed?: unknown }
    | null;

  const existing = await getOnboarding(project.id).catch(() => null);
  const now = new Date().toISOString();
  const next: OnboardingState = { ...(existing ?? {}), updatedAt: now };

  if (body?.scan !== undefined) {
    const profile = sanitizeScanProfile(body.scan);
    if (!profile) {
      return Response.json({ ok: false, error: "Neplatný profil ze skenu." }, { status: 422 });
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
  }

  if (typeof body?.dismissed === "boolean") next.dismissed = body.dismissed;

  await saveOnboarding(project.id, next);
  return Response.json({ ok: true });
}

/** Reset onboarding (drops the applied scan + flags). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });
  await clearOnboarding(project.id);
  return Response.json({ ok: true });
}
