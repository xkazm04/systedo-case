/** /app — the project hub. Lists the signed-in user's projects, or runs first-run
 *  onboarding when they have none. Stands alone (no project sidebar); choosing a
 *  project opens /app/[projectId] where the shell takes over. */
import { Suspense } from "react";
import { connection } from "next/server";
import { auth } from "@/auth";
import { listProjects } from "@/lib/projects/store";
import ProjectsHome from "@/components/app/ProjectsHome";

export default function AppHomePage() {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className="animate-loading-reveal flex min-h-[55vh] items-center justify-center"
          aria-busy="true"
        >
          <span className="sr-only">Načítání… · Loading…</span>
        </div>
      }
    >
      <AppHomeContent />
    </Suspense>
  );
}

async function AppHomeContent() {
  // Firestore client init pulls in `node:crypto` randomBytes, which Cache
  // Components rejects as an unstable value during prerender. This hub is
  // per-user anyway (no static shell to gain), so mark it request-time only with
  // connection() and stream it behind the Suspense fallback above. The project
  // module routes don't need this — their `await params` already suspends before
  // any Firestore access runs.
  await connection();
  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  const projects = userId ? await listProjects(userId) : [];
  return <ProjectsHome projects={projects} />;
}
