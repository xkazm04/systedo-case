/** Guard for module pages under /app/[projectId]/{module}. Resolves the project
 *  for the signed-in user and 404s if the project doesn't exist / isn't theirs,
 *  or if the module isn't available for the project's type (so a content project
 *  can't open /kampane). Server-only. */
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getProject } from "./store";
import { isModuleAvailable } from "./modules";
import type { Project } from "./types";

export async function requireProjectModule(
  projectId: string,
  moduleKey: string
): Promise<Project> {
  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  if (!userId) notFound();
  const project = await getProject(userId, projectId);
  if (!project) notFound();
  if (!isModuleAvailable(project.type, moduleKey)) notFound();
  return project;
}
