/** Guard for module pages under /app/[projectId]/{module}. Resolves the project
 *  for the signed-in user and 404s if the project doesn't exist / isn't theirs,
 *  or if the module isn't available for the project's type (so a content project
 *  can't open /kampane). Server-only.
 *
 *  A MISSING SESSION is not a 404: the /app AuthGate owns the signed-out case, but
 *  it doesn't re-run on client-side navigation between modules — so if the cookie
 *  expired mid-session, only this guard re-executes on the server. Redirect such a
 *  user to /app (where the AuthGate renders the sign-in screen) instead of dropping
 *  them on the root not-found page, which reads as "your project was deleted".
 *  notFound() stays reserved for the genuinely missing/foreign project and the
 *  unavailable-module cases (deliberate anti-enumeration for foreign project IDs).
 *
 *  The session read (currentUserId) and getProject are both request-deduped via
 *  React `cache()`, so when the project layout already resolved them for this
 *  navigation, this guard reuses those reads instead of hitting Firestore again. */
import { notFound, redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { getProject } from "./store";
import { areasFor, isModuleAvailable } from "./modules";
import type { AreaKey } from "./areas";
import type { Project } from "./types";

export async function requireProjectModule(
  projectId: string,
  moduleKey: string
): Promise<{ project: Project; userId: string }> {
  const userId = await currentUserId();
  if (!userId) redirect("/app");
  const project = await getProject(userId, projectId);
  if (!project) notFound();
  if (!isModuleAvailable(project.type, moduleKey)) notFound();
  // Return the resolved userId (non-null — the guard asserted it) alongside the
  // project so callers don't re-fetch currentUserId or defensively re-handle a
  // nullability the guard already eliminated.
  return { project, userId };
}

/** Guard for an area roof under /app/[projectId]/{area} (ADR-0013): the same
 *  session and ownership rules as a module, and a 404 when the project's type has
 *  no module in the area (an e-shop has no Local roof). */
export async function requireProjectArea(
  projectId: string,
  area: AreaKey
): Promise<{ project: Project; userId: string }> {
  const userId = await currentUserId();
  if (!userId) redirect("/app");
  const project = await getProject(userId, projectId);
  if (!project) notFound();
  if (!areasFor(project.type).includes(area)) notFound();
  return { project, userId };
}
