/** POST /api/sken/redeem — turn a parked public scan into a real, seeded project.
 *
 *  The authed half of the `/sken` flow. Everything this route writes is keyed off
 *  `currentUserId()` (ADR-0002) — the claim carries a profile and a URL, never an
 *  owner, so possession of a token can only ever seed a project the possessor OWNS
 *  (a new one, or one of theirs they picked). The token is consumed on the way in,
 *  once the destination is decided, which is what makes a redeem
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
 *  WHERE the scan goes (onboarding-B). A caller that sends `chooser: true` is asked
 *  first when it already owns a project for the scanned site: the route PEEKS at the
 *  claim (`getScanClaim`, which does not consume), and answers 409 `choose-target`
 *  with the matching projects, leaving the token unspent. The client then re-POSTs
 *  with `target`: a project id merges the scan into that project through the same
 *  `applyScanToProject` (competitors merge, the keyword seed is idempotent — nothing
 *  curated is replaced) and never provisions, so no second row and no second starter
 *  catalog; `"new"` takes today's path. The target is ownership-checked through
 *  `getProject(uid, id)` BEFORE the consume, so a bad one costs nothing. A caller that
 *  sends neither field (an older client) gets exactly the create path it always had.
 *
 *  Deliberately NOT here: `recordOnboardingActivation()`. Activation is the
 *  checklist's one-shot transition and onboarding/progress.ts owns it; firing it
 *  from a fresh project would make the activation KPI count creations. */
import { currentUserId } from "@/lib/session";
import { provisionProject, type ProvisionResult } from "@/lib/projects/provision";
import { getProject, listProjects } from "@/lib/projects/store";
import { consumeScanClaim, getScanClaim, restoreScanClaim } from "@/lib/onboarding/claim-store";
import { applyScanToProject, type ApplyScanOutcome } from "@/lib/onboarding/apply";
import { matchProjectsByDomain, NEW_PROJECT_TARGET, type RedeemCandidate } from "@/lib/onboarding/redeem-plan";
import { recordSkenClaim } from "@/lib/onboarding/sken-track";
import {
  apiError,
  badRequest,
  isProjectType,
  notFound,
  readJson,
  type ApiErrorCode,
} from "@/lib/api/route-utils";
import type { Project } from "@/lib/projects/types";

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

/** Merge the claim into a project the caller already owns. The target was
 *  ownership-checked by the caller; the consume happens here, and a failed apply puts
 *  the claim back — the apply is merge-only and idempotent, so a retry is safe. */
async function mergeInto(uid: string, token: string, project: Project): Promise<Response> {
  const claim = await consumeScanClaim(token);
  if (!claim) return notFound("Odkaz na sken vypršel nebo už byl použit.", "not-found");
  let applied: ApplyScanOutcome;
  try {
    applied = await applyScanToProject(uid, project, claim.profile);
  } catch {
    await restoreScanClaim(claim).catch(() => false);
    return apiError(503, "Sken se nepodařilo uložit do projektu. Zkuste to prosím znovu.", "redeem-retry");
  }
  void recordSkenClaim();
  const outcome = {
    scan: "applied" as const,
    ...(applied.competitors ? { competitors: applied.competitors } : {}),
    keywords: applied.keywords,
  };
  return Response.json({ projectId: project.id, merged: true, outcome }, { status: 200 });
}

export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return apiError(401, "Nepřihlášeno.", "unauthorized");

  const body = await readJson<{ token?: unknown; target?: unknown; chooser?: unknown }>(req);
  if (typeof body?.token !== "string" || !body.token) {
    return badRequest("Chybí token skenu.", "missing-field");
  }
  const target = body.target;
  if (target !== undefined && (typeof target !== "string" || !target)) {
    return badRequest("Neplatný cíl skenu.", "invalid-type");
  }

  // An explicit existing project: ownership first (a stranger's id reads as absent),
  // and only then the consume — a bad target never spends the token.
  if (typeof target === "string" && target !== NEW_PROJECT_TARGET) {
    const project = await getProject(uid, target);
    if (!project) return notFound("Tento projekt nemáte.", "unknown-target");
    return mergeInto(uid, body.token, project);
  }

  // Offer the choice — only to a client that can render it, and only when the caller
  // already owns the scanned site. A peek, never a consume; a failed project read
  // falls through to the create path this route always had.
  if (target === undefined && body.chooser === true) {
    const peek = await getScanClaim(body.token);
    if (!peek) return notFound("Odkaz na sken vypršel nebo už byl použit.", "not-found");
    const owned = await listProjects(uid).catch(() => [] as Project[]);
    const matches = matchProjectsByDomain(owned, peek.profile.scannedUrl);
    if (matches.length > 0) {
      const candidates: RedeemCandidate[] = matches.map((p) => ({
        id: p.id,
        name: p.name,
        domain: p.domain ?? "",
        type: p.type,
      }));
      const code: ApiErrorCode = "choose-target";
      return Response.json(
        { error: "Pro tento web už projekt máte. Vyberte, kam sken uložit.", code, candidates },
        { status: 409 }
      );
    }
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
