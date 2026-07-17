/** Project home of /app/[projectId] — a cross-project portfolio overview across
 *  all of the user's projects, with the routed project highlighted. Falls back to
 *  that project's own KPI view when the workspace holds a single project. */
import { requireProjectModule } from "@/lib/projects/guard";
import { listProjects } from "@/lib/projects/store";
import ProjectOverview from "@/components/app/ProjectOverview";
import OnboardingProgressCard from "@/components/app/OnboardingProgressCard";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // Guards auth + ownership + module availability, and gives us the active project
  // plus the (guaranteed non-null) userId — no re-fetch, no null branch to handle.
  const { project, userId } = await requireProjectModule(projectId, "");
  // listProjects reuses the layout's request-deduped read — no extra round-trip.
  const projects = await listProjects(userId);
  return (
    <>
      {/* Guides a new project through setup until every step is done or dismissed. */}
      <OnboardingProgressCard project={project} userId={userId} />
      <ProjectOverview projects={projects} activeProjectId={project.id} />
    </>
  );
}
