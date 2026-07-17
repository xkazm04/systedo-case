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
import { isModuleAvailable } from "./modules";
import type { Project } from "./types";

export async function requireProjectModule(
  projectId: string,
  moduleKey: string
): Promise<Project> {
  const userId = await currentUserId();
  if (!userId) redirect("/app");
  const project = await getProject(userId, projectId);
  if (!project) notFound();
  if (!isModuleAvailable(project.type, moduleKey)) notFound();
  return project;
}
