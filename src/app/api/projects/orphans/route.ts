/** The on-demand face of the orphan integrity sweep (src/lib/projects/orphan-sweep).
 *
 *  GET  → REPORT ONLY. Everything of this user's that a failed deletion cascade left
 *         behind: which project, which stores, since when, how many attempts.
 *         Removes nothing, ever.
 *  POST → APPLY. Finish the cleanup. Optionally takes `projectIds` — orphans that
 *         predate the durable ledger, whose ids an operator has from an old audit
 *         record. Each is verified GONE before anything is deleted.
 *
 *  WHY A ROUTE AND NOT A SCRIPT OR A CRON (a deliberate choice, per the direction):
 *   • The data is per-USER and so is the ledger. A session-authenticated route acts
 *     as exactly one user and physically cannot reach another tenant's data — a
 *     script running with the service account can, and one wrong argument would be
 *     unrecoverable in the opposite direction from the bug we are fixing.
 *   • It needs no credentials that don't already exist, no scheduler, and it works
 *     identically on both backends — a script would need the Firestore service
 *     account wired up separately from the app that already has it.
 *   • The sweep's PRIMARY invocation is not this route at all: DELETE
 *     /api/projects/[id] resumes pending cleanup automatically, so the normal case
 *     heals itself with nobody involved. This is the escape hatch for the case that
 *     does not — a user who never deletes another project, or a pre-ledger orphan.
 *   • A cron was rejected: there is no per-user scheduler in this app, and inventing
 *     one to re-run a handful of idempotent deletes would be more moving parts than
 *     the problem has.
 *  No UI is built for it; none was asked for.
 *
 *  Server-only. Not under `[id]` — it is user-scoped, not project-scoped, so it does
 *  not (and structurally cannot) use the per-project ownership guard. */
import { currentUserId } from "@/lib/session";
import { sweepProjectOrphans } from "@/lib/projects/orphan-sweep";
import { apiError, readJson } from "@/lib/api/route-utils";

function unauthorized(): Response {
  return apiError(401, "Nepřihlášeno.", "unauthorized");
}

/** Report what a failed deletion cascade left behind. Read-only by construction. */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return unauthorized();
  return Response.json({ ok: true, report: await sweepProjectOrphans(uid) });
}

/** Finish the cleanup. Idempotent — a second call finds nothing left to do. */
export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return unauthorized();

  const body = await readJson<{ projectIds?: unknown }>(req);
  const supplied = Array.isArray(body?.projectIds)
    ? body.projectIds.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, 100)
    : [];

  const report = await sweepProjectOrphans(uid, { apply: true, projectIds: supplied });
  return Response.json({ ok: true, report });
}
