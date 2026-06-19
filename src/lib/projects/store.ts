/** Per-user project store — backend dispatcher. Resolves to the local node:sqlite
 *  store (`.data/systedo.db`) when LOCAL_DB is on, else the Firestore store. The
 *  backend is imported LAZILY so the LOCAL_DB path never evaluates
 *  `store.firestore` (and therefore never pulls firebase-admin in / triggers its
 *  init). Both backends export an identical interface, so every call site —
 *  layout, project hub, guard, /api/projects — is unchanged. Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { NewProjectInput, Project, ProjectPatch } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** All of a user's projects, newest first. */
export async function listProjects(userId: string): Promise<Project[]> {
  return (await backend()).listProjects(userId);
}

/** A single project, or null if it doesn't exist / isn't the user's. */
export async function getProject(userId: string, projectId: string): Promise<Project | null> {
  return (await backend()).getProject(userId, projectId);
}

/** Create a project and return it. */
export async function createProject(userId: string, input: NewProjectInput): Promise<Project> {
  return (await backend()).createProject(userId, input);
}

/** Patch an existing project; returns the updated project or null if missing. */
export async function updateProject(
  userId: string,
  projectId: string,
  patch: ProjectPatch
): Promise<Project | null> {
  return (await backend()).updateProject(userId, projectId, patch);
}

/** Delete a project. */
export async function deleteProject(userId: string, projectId: string): Promise<void> {
  return (await backend()).deleteProject(userId, projectId);
}
