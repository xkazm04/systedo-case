"use client";

/** Active-project context for the app shell. The server layout loads the active
 *  project (from the `[projectId]` route param) plus the user's project list and
 *  seeds this provider, so client components — the sidebar, switcher, overview —
 *  read one source of truth without re-fetching. */
import { createContext, useContext } from "react";
import type { Project } from "./types";

interface ProjectContextValue {
  /** the project the current /app/[projectId] route is scoped to */
  project: Project;
  /** all of the user's projects, for the switcher */
  projects: Project[];
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({
  project,
  projects,
  children,
}: {
  project: Project;
  projects: Project[];
  children: React.ReactNode;
}) {
  return (
    <ProjectContext.Provider value={{ project, projects }}>{children}</ProjectContext.Provider>
  );
}

function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}

/** The active project for the current route. */
export function useProject(): Project {
  return useProjectContext().project;
}

/** The active project, or null when rendered outside a ProjectProvider (e.g. the
 *  public /kampane page). Lets a shared client thread its projectId into API
 *  calls when inside the app shell, and fall back to the per-user tenant when not. */
export function useOptionalProject(): Project | null {
  return useContext(ProjectContext)?.project ?? null;
}

/** All of the user's projects (for the switcher). */
export function useProjects(): Project[] {
  return useProjectContext().projects;
}
