/** Shared ownership guard for the `/api/projects/[id]/**` routes. Resolves the
 *  signed-in owner's project, or hands back the exact Response the route should
 *  return (401 when unauthenticated, 404 when the project isn't the caller's).
 *  Server-only — it reads the request session.
 *
 *  Usage:
 *    const g = await requireOwnedProject(id);
 *    if ("error" in g) return g.error;
 *    const { project, uid } = g; */
import "server-only";
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import type { Project } from "@/lib/projects/types";

export async function requireOwnedProject(
  id: string
): Promise<{ project: Project; uid: string } | { error: Response }> {
  const uid = await currentUserId();
  if (!uid) return { error: Response.json({ error: "Nepřihlášeno." }, { status: 401 }) };
  const project = await getProject(uid, id);
  if (!project) return { error: Response.json({ error: "Projekt nenalezen." }, { status: 404 }) };
  return { project, uid };
}
