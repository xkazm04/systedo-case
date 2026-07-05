/** Guard for module pages under /app/[projectId]/{module}. Resolves the project
 *  for the signed-in user and 404s if the project doesn't exist / isn't theirs,
 *  or if the module isn't available for the project's type (so a content project
 *  can't open /kampane). Server-only.
 *
 *  The session read (currentUserId) and getProject are both request-deduped via
 *  React `cache()`, so when the project layout already resolved them for this
 *  navigation, this guard reuses those reads instead of hitting Firestore again. */
import { notFound } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { getProject } from "./store";
import { isModuleAvailable } from "./modules";
import type { Project } from "./types";

export async function requireProjectModule(
  projectId: string,
  moduleKey: string
): Promise<Project> {
  const userId = await currentUserId();
  if (!userId) notFound();
  const project = await getProject(userId, projectId);
  if (!project) notFound();
  if (!isModuleAvailable(project.type, moduleKey)) notFound();
  return project;
}
