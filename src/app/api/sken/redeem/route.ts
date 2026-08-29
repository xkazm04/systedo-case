/** POST /api/sken/redeem — turn a parked public scan into a real, seeded project.
 *
 *  The authed half of the `/sken` flow. Everything this route writes is keyed off
 *  `currentUserId()` (ADR-0002) — the claim carries a profile and a URL, never an
 *  owner, so possession of a token can only ever seed the possessor's OWN new
 *  project. The token is consumed on the way in, which is what makes a redeem
 *  single-use: a second POST with the same token finds nothing and 404s instead of
 *  minting a second project (double-click, back button, a shared callbackUrl).
 *
 *  The project is created exactly as POST /api/projects does — createProject, a
 *  best-effort starter catalog, an activity entry — and then seeded through
 *  `applyScanToProject`, the SAME function the in-app onboarding apply calls. That
 *  is the whole point of the extraction: "claimed" and "applied in the app" cannot
 *  mean two different things.
 *
 *  Deliberately NOT here: `recordOnboardingActivation()`. Activation is the
 *  checklist's one-shot transition and onboarding/progress.ts owns it; firing it
 *  from a fresh project would make the activation KPI count creations. */
import { currentUserId } from "@/lib/session";
import { createProject } from "@/lib/projects/store";
import { saveOfferings } from "@/lib/catalog/store";
import { defaultNatureFor, starterCatalog } from "@/lib/catalog/starter";
import { emitProjectActivity } from "@/lib/activity/emit";
import { consumeScanClaim } from "@/lib/onboarding/claim-store";
import { applyScanToProject } from "@/lib/onboarding/apply";
import { recordSkenClaim } from "@/lib/onboarding/sken-track";
import { apiError, badRequest, isProjectType, notFound, readJson } from "@/lib/api/route-utils";

/** The domain to file the project under: the host of the scanned URL, without a
 *  leading www. Never the raw string the visitor typed — that has already been
 *  through the sanitizer, but it is still a URL, not a domain. */
function domainOf(scannedUrl: string | undefined): string | undefined {
  if (!scannedUrl) return undefined;
  try {
    const host = new URL(scannedUrl).hostname.replace(/^www\./i, "");
    return host || undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return apiError(401, "Nepřihlášeno.", "unauthorized");

  const body = await readJson<{ token?: unknown }>(req);
  if (typeof body?.token !== "string" || !body.token) {
    return badRequest("Chybí token skenu.", "missing-field");
  }

  // Consume FIRST: read-and-retire, so the token is spent whether or not the rest
  // succeeds. A malformed / unknown / already-used / expired token is one 404 — the
  // caller cannot tell them apart, and does not need to.
  const claim = await consumeScanClaim(body.token);
  if (!claim) return notFound("Odkaz na sken vypršel nebo už byl použit.", "not-found");

  const { profile } = claim;
  const domain = domainOf(profile.scannedUrl);
  // The scan's own guess is a hint, not a contract: it round-tripped through the
  // wire and a store, so it is re-validated against the real ProjectType set here.
  // "content" is the honest default — it is the type whose modules assume the least
  // about a business we only read a homepage of.
  const type = isProjectType(claim.suggestedType) ? claim.suggestedType : "content";
  const name = profile.businessName || domain || "Nový projekt";

  const project = await createProject(uid, { name, type, ...(domain ? { domain } : {}) });

  // Seed a persisted starter catalog so the new project's modules have real,
  // project-owned data from day one. Best-effort, exactly as POST /api/projects:
  // a store hiccup must not fail creation.
  try {
    await saveOfferings(
      uid,
      project.id,
      starterCatalog(project.id, project.type, defaultNatureFor(project.type), new Date().toISOString())
    );
  } catch {
    /* starter seed failed — modules fall back to the seed until the user saves */
  }

  // Best-effort, unlike POST /api/projects: past this line the token is already
  // spent and the project already exists, so an activity-log hiccup must not turn a
  // successful claim into a 500 the visitor can never retry.
  try {
    await emitProjectActivity(uid, project.id, {
      kind: "update",
      module: "nastaveni",
      severity: "success",
      title: "Projekt vytvořen ze skenu",
      detail: project.name,
      actor: "Vy",
    });
  } catch {
    /* activity is a log, not the outcome */
  }

  // The same apply the in-app onboarding runs: profile + competitor suggestions +
  // the scan-seeded keyword list, one onboarding write.
  await applyScanToProject(uid, project, profile);

  void recordSkenClaim();
  return Response.json({ projectId: project.id }, { status: 201 });
}
