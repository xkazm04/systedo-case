/** /app — the project hub. Lists the signed-in user's projects, or runs first-run
 *  onboarding when they have none. Stands alone (no project sidebar); choosing a
 *  project opens /app/[projectId] where the shell takes over. */
import { auth } from "@/auth";
import { listProjects } from "@/lib/projects/store";
import ProjectsHome from "@/components/app/ProjectsHome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  const projects = userId ? await listProjects(userId) : [];
  return <ProjectsHome projects={projects} />;
}
