/** Per-user project store (Firestore, server-only). Projects live in a per-user
 *  subcollection `users/{userId}/projects/{projectId}`. A project is the
 *  workspace the authed product is organized around; its `type` drives the
 *  sidebar + KPI preset. Server-only (firebase-admin is Node-only). */
import { firestore } from "@/lib/firebase";
import {
  PROJECT_TYPE_META,
  type NewProjectInput,
  type Project,
  type ProjectPatch,
} from "./types";

function projectsCol(userId: string) {
  return firestore.collection("users").doc(userId).collection("projects");
}

/** Firestore returns a DocumentData; this narrows it back to Project, tolerating
 *  legacy docs that predate a field. */
function toProject(id: string, data: FirebaseFirestore.DocumentData): Project {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "Projekt",
    type: data.type ?? "eshop",
    accentColor: data.accentColor ?? PROJECT_TYPE_META.eshop.defaultAccent,
    domain: data.domain || undefined,
    tenant: data.tenant || undefined,
    adsCustomerId: data.adsCustomerId || undefined,
    createdAt: data.createdAt ?? new Date(0).toISOString(),
    updatedAt: data.updatedAt ?? data.createdAt ?? new Date(0).toISOString(),
  };
}

/** All of a user's projects, newest first. */
export async function listProjects(userId: string): Promise<Project[]> {
  const snap = await projectsCol(userId).get();
  return snap.docs
    .map((d) => toProject(d.id, d.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A single project, or null if it doesn't exist / isn't the user's. */
export async function getProject(userId: string, projectId: string): Promise<Project | null> {
  const doc = await projectsCol(userId).doc(projectId).get();
  return doc.exists ? toProject(doc.id, doc.data()!) : null;
}

/** Create a project and return it (Firestore auto-generates the id). */
export async function createProject(userId: string, input: NewProjectInput): Promise<Project> {
  const now = new Date().toISOString();
  const ref = projectsCol(userId).doc();
  const project: Omit<Project, "id"> = {
    name: input.name.trim() || PROJECT_TYPE_META[input.type].label,
    type: input.type,
    accentColor: input.accentColor || PROJECT_TYPE_META[input.type].defaultAccent,
    ...(input.domain ? { domain: input.domain.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(project);
  return { id: ref.id, ...project };
}

/** Patch an existing project; returns the updated project or null if missing. */
export async function updateProject(
  userId: string,
  projectId: string,
  patch: ProjectPatch
): Promise<Project | null> {
  const ref = projectsCol(userId).doc(projectId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  // Drop undefined keys so we never write `undefined` into Firestore.
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await ref.set({ ...clean, updatedAt: new Date().toISOString() }, { merge: true });
  return toProject(projectId, { ...doc.data(), ...clean, updatedAt: new Date().toISOString() });
}

/** Delete a project. (Data modules still key on the per-user tenant in v1, so
 *  this removes the workspace entry, not campaign/social data.) */
export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await projectsCol(userId).doc(projectId).delete();
}
