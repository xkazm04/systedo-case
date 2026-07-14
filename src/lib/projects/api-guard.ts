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
  /** Error envelope: "bare" → `{ error }` (default), "ok" → `{ ok:false, error }`. */
  envelope?: "bare" | "ok";
  /** With envelope "ok", also emit a stable machine `code` ("unauthorized" |
   *  "not-found") alongside `error` — matches the onboarding route's bilingual shape. */
  code?: boolean;
  /** Override the default Czech messages (e.g. the brand-context demo route's
   *  English copy). */
  messages?: { unauthorized?: string; notFound?: string };
}

function guardError(
  status: number,
  code: "unauthorized" | "not-found",
  message: string,
  opts: OwnershipGuardOptions
): Response {
  if (opts.envelope === "ok") {
    const body = opts.code ? { ok: false, code, error: message } : { ok: false, error: message };
    return Response.json(body, { status });
  }
  return Response.json({ error: message }, { status });
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
