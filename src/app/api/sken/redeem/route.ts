/** POST /api/sken/redeem — turn a parked public scan into a real, seeded project.
 *
 *  The authed half of the `/sken` flow. Everything this route writes is keyed off
 *  `currentUserId()` (ADR-0002) — the claim carries a profile and a URL, never an
 *  owner, so possession of a token can only ever seed the possessor's OWN new
 *  project. The token is consumed on the way in, which is what makes a redeem
 *  single-use: a second POST with the same token finds nothing and 404s instead of
 *  minting a second project (double-click, back button, a shared callbackUrl).
 *
 *  The project is born through `provisionProject` — the same seam POST /api/projects
 *  uses (row, best-effort starter catalog, activity entry) — and then seeded through
 *  `applyScanToProject`, the SAME function the in-app onboarding apply calls. That
 *  is the whole point of both extractions: "claimed" and "created / applied in the
 *  app" cannot mean two different things.
 *
 *  The failure line is where the project starts to exist:
 *   - BEFORE it (provisioning threw): the claim is put back (`restoreScanClaim`,
 *     fail-closed on expiry) and the answer is 503 `redeem-retry`, so the visitor
 *     retries with the same token instead of re-running a rate-limited scan;
 *   - AFTER it: the answer is 201 with a per-part `outcome`. A scan apply that
 *     failed is reported as `scan: "failed"`, never a 500 — the token is spent and
 *     the project exists, so a 500 would be a dead end the visitor cannot retry.
 *
 *  Deliberately NOT here: `recordOnboardingActivation()`. Activation is the
 *  checklist's one-shot transition and onboarding/progress.ts owns it; firing it
 *  from a fresh project would make the activation KPI count creations. */
import { currentUserId } from "@/lib/session";
import { provisionProject, type ProvisionResult } from "@/lib/projects/provision";
import { consumeScanClaim, restoreScanClaim } from "@/lib/onboarding/claim-store";
import { applyScanToProject, type ApplyScanOutcome } from "@/lib/onboarding/apply";
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

  // Consume FIRST: read-and-retire, so a double-click cannot mint two projects. A
  // malformed / unknown / already-used / expired token is one 404 — the caller cannot
  // tell them apart, and does not need to. Only a failure before the project exists
  // puts the claim back (below).
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

  let provisioned: ProvisionResult;
  try {
    provisioned = await provisionProject(
      uid,
      { name, type, ...(domain ? { domain } : {}) },
      { activityTitle: "Projekt vytvořen ze skenu" }
    );
  } catch {
    // Nothing exists yet — undo the consume so the same token can be retried.
    await restoreScanClaim(claim).catch(() => false);
    return apiError(503, "Projekt se nepodařilo založit. Zkuste to prosím znovu.", "redeem-retry");
  }
  const { project } = provisioned;

  // The same apply the in-app onboarding runs: profile + competitor suggestions +
  // the scan-seeded keyword list, one onboarding write. Past this line the project
  // exists, so a failure is reported per part rather than thrown.
  const applied: ApplyScanOutcome | null = await applyScanToProject(uid, project, profile).catch(() => null);

  const outcome = {
    scan: applied ? ("applied" as const) : ("failed" as const),
    ...(applied?.competitors ? { competitors: applied.competitors } : {}),
    ...(applied ? { keywords: applied.keywords } : {}),
    catalogSeeded: provisioned.catalogSeeded,
    activityLogged: provisioned.activityLogged,
  };

  void recordSkenClaim();
  return Response.json({ projectId: project.id, outcome }, { status: 201 });
}
