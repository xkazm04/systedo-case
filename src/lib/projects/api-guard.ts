/** Shared ownership guard for the `/api/projects/[id]/**` routes. Resolves the
 *  signed-in owner's project, or hands back the exact Response the route should
 *  return (401 when unauthenticated, 404 when the project isn't the caller's).
 *  Server-only — it reads the request session.
 *
 *  This is the ONE place the currentUserId + getProject + 401/404 handshake lives;
 *  no projects sub-resource should re-inline it (a structural test pins that). The
 *  `opts` only shape the ERROR envelope so each route keeps its exact historical
 *  response body — the `{ error }` vs `{ ok:false, error }` split is deliberately
 *  preserved here and unified in a later direction, not this one.
 *
 *  Usage (bare `{ error }` envelope — the default):
 *    const g = await requireOwnedProject(id);
 *    if ("error" in g) return g.error;
 *    const { project, uid } = g;
 *
 *  Usage (routes that answer with `{ ok:false, error }`):
 *    const g = await requireOwnedProject(id, { envelope: "ok" });
 *
 *  Status convention across the sub-resources: 401/404 come from here; a malformed
 *  or missing body is 400 (badRequest) and a well-formed body that fails semantic
 *  validation is 422 (unprocessable) — see src/lib/api/route-utils.ts. */
import "server-only";
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import type { Project } from "@/lib/projects/types";

const DEFAULT_UNAUTHORIZED = "Nepřihlášeno.";
const DEFAULT_NOT_FOUND = "Projekt nenalezen.";

export interface OwnershipGuardOptions {
  /** Error envelope: "bare" → `{ error, code }` (default), "ok" → `{ ok:false, code, error }`. */
  envelope?: "bare" | "ok";
  /** Legacy no-op: the stable machine `code` ("unauthorized" | "not-found") is now
   *  emitted UNCONDITIONALLY in both envelopes (it is additive — the `error` field and
   *  status are unchanged, so a client that ignores `code` is unaffected). Kept so
   *  existing `code: true` call sites (onboarding) stay valid. */
  code?: boolean;
  /** Override the default Czech messages (e.g. a route whose surface convention differs). */
  messages?: { unauthorized?: string; notFound?: string };
}

/** Both auth/ownership failures ALWAYS carry their machine `code` now — this is the
 *  single choke point that gives every projects sub-resource a coded 401/404 without
 *  each route opting in (route-specific 4xx codes flow through the route-utils builders). */
function guardError(
  status: number,
  code: "unauthorized" | "not-found",
  message: string,
  opts: OwnershipGuardOptions
): Response {
  const body =
    opts.envelope === "ok"
      ? { ok: false, code, error: message }
      : { error: message, code };
  return Response.json(body, { status });
}

/** Verify a wire-supplied `projectId` belongs to the caller BEFORE it is turned into a
 *  tenant key. The tenant-keyed routes (campaigns/share, microsite, social/*) build
 *  `buildTenantKey(userId, projectId)` from a raw body/query id; an unverified typo'd,
 *  stale or deleted id silently mints a FRESH EMPTY tenant — share links that list as
 *  zero reports, scheduled posts that vanish, and orphaned blobs the delete cascade can
 *  never reach. Returns a 404 Response when a non-empty id is not the user's project,
 *  else null — including the legitimate keyless paths (anonymous visitor, or a
 *  signed-in user with no active project), which are left untouched. */
export async function rejectUnknownProject(
  userId: string | null,
  projectId: string | null | undefined,
  notFound: string = DEFAULT_NOT_FOUND
): Promise<Response | null> {
  if (!userId || !projectId) return null;
  const project = await getProject(userId, projectId);
  if (project) return null;
  return Response.json({ error: notFound, code: "not-found" }, { status: 404 });
}

export async function requireOwnedProject(
  id: string,
  opts: OwnershipGuardOptions = {}
): Promise<{ project: Project; uid: string } | { error: Response }> {
  const uid = await currentUserId();
  if (!uid) {
    return { error: guardError(401, "unauthorized", opts.messages?.unauthorized ?? DEFAULT_UNAUTHORIZED, opts) };
  }
  const project = await getProject(uid, id);
  if (!project) {
    return { error: guardError(404, "not-found", opts.messages?.notFound ?? DEFAULT_NOT_FOUND, opts) };
  }
  return { project, uid };
}
