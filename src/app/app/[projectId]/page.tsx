/** Project home of /app/[projectId] — a cross-project portfolio overview across
 *  all of the user's projects, with the routed project highlighted. Falls back to
 *  that project's own KPI view when the workspace holds a single project. */
import { auth } from "@/auth";
import { requireProjectModule } from "@/lib/projects/guard";
import { listProjects } from "@/lib/projects/store";
import ProjectOverview from "@/components/app/ProjectOverview";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // Guards auth + ownership + module availability, and gives us the active project.
  const project = await requireProjectModule(projectId, "");
  const userId = ((await auth())?.user as { id?: string } | undefined)?.id;
  const projects = userId ? await listProjects(userId) : [project];
  return <ProjectOverview projects={projects} activeProjectId={project.id} />;
}
