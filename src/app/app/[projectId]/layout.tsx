/** Loads the active project for /app/[projectId]/* and seeds the client shell.
 *  The parent /app layout already guarantees a session; here we resolve the
 *  project (404 if it isn't the user's) and the full project list (for the
 *  switcher), then render the sidebar shell around the module page. */
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getProject, listProjects } from "@/lib/projects/store";
import { ProjectProvider } from "@/lib/projects/context";
import AppShell from "@/components/app/AppShell";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  if (!userId) notFound();

  const [project, projects] = await Promise.all([
    getProject(userId, projectId),
    listProjects(userId),
  ]);
  if (!project) notFound();

  return (
    <ProjectProvider project={project} projects={projects}>
      <AppShell>{children}</AppShell>
    </ProjectProvider>
  );
}
