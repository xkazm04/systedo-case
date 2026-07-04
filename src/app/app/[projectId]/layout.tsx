/** Loads the active project for /app/[projectId]/* and seeds the client shell.
 *  The parent /app layout already guarantees a session; here we resolve the
 *  project (404 if it isn't the user's) and the full project list (for the
 *  switcher), then render the sidebar shell around the module page.
 *
 *  Under Cache Components the params/auth/project reads must live inside a
 *  <Suspense> boundary so the layout prerenders an instant app-shell skeleton;
 *  the real, per-user shell streams in behind it. Client-side navigation between
 *  modules keeps this layout mounted, so the resolve runs once per project entry,
 *  not per module — the per-module skeleton is provided by ./loading.tsx. */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getProject, listProjects } from "@/lib/projects/store";
import { ProjectProvider } from "@/lib/projects/context";
import AppShell from "@/components/app/AppShell";
import AppShellSkeleton from "@/components/app/AppShellSkeleton";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <ProjectGate params={params}>{children}</ProjectGate>
    </Suspense>
  );
}

async function ProjectGate({
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
