/** The on-demand face of the DEPENDENT-side orphan walk (../route.ts is the
 *  parent-first sweep's; this is the other direction — see
 *  src/lib/projects/orphan-walk.ts and docs/specs/2026-08-30-orphan-dependent-walk.md).
 *
 *  GET  → REPORT ONLY. Enumerate the dependent stores themselves and list every
 *         project id seen there whose owner no longer exists — including orphans
 *         that predate the durable ledger and whose id nobody kept, the class the
 *         parent-first sweep structurally cannot find. Removes nothing, ever.
 *  POST → APPLY. Hand the orphaned ids to the registry-derived sweep (the one
 *         delete path), then re-enumerate and report any residue honestly.
 *
 *  Same doctrine as the sibling route: session-authenticated, so it acts as
 *  exactly one user; user-scoped, not project-scoped, so it lives outside `[id]`.
 *  Server-only. */
import { currentUserId } from "@/lib/session";
import { walkDependentStores } from "@/lib/projects/orphan-walk";
import { apiError } from "@/lib/api/route-utils";

function unauthorized(): Response {
  return apiError(401, "Nepřihlášeno.", "unauthorized");
}

/** Report what the dependent stores hold for owners that no longer exist. */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return unauthorized();
  return Response.json({ ok: true, report: await walkDependentStores(uid) });
}

/** Finish the cleanup. Idempotent — a second call finds nothing new to do. */
export async function POST() {
  const uid = await currentUserId();
  if (!uid) return unauthorized();
  return Response.json({ ok: true, report: await walkDependentStores(uid, { apply: true }) });
}
