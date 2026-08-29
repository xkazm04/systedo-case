/** Per-user project store — FIRESTORE backend (the cloud / production path).
 *  Projects live in a per-user subcollection `users/{userId}/projects/{projectId}`.
 *  A project is the workspace the authed product is organized around; its `type`
 *  drives the sidebar + KPI preset. Server-only (firebase-admin is Node-only).
 *
 *  Selected by the dispatcher in `store.ts` when LOCAL_DB is off. Importing this
 *  module pulls in `@/lib/firebase`, so the dispatcher loads it lazily and the
 *  LOCAL_DB path never touches it. */
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase";
import {
  PROJECT_TYPE_META,
  coerceProjectType,
  normalizeProjectPatch,
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
    type: coerceProjectType(data.type),
    accentColor: data.accentColor ?? PROJECT_TYPE_META.eshop.defaultAccent,
    logoUrl: data.logoUrl || undefined,
    domain: data.domain || undefined,
    tenant: data.tenant || undefined,
    adsCustomerId: data.adsCustomerId || undefined,
    // ADR-0010: absent on every doc written before the flag existed → undefined,
    // which reads as "not linked" everywhere. Only a stored `true` links.
    ...(data.sklikLinked === true ? { sklikLinked: true } : {}),
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
    // `input.domain?.trim()` (not `input.domain`) so a whitespace-only value doesn't
    // store `domain: ""` here while the local backend omits it — same guard as local.
    ...(input.domain?.trim() ? { domain: input.domain.trim() } : {}),
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
  // Normalize once (shared with the local backend) so both persist identically:
  // trims text, empty string on a nullable field → CLEAR. A cleared field maps to
  // FieldValue.delete() so the key is removed rather than stored as "" (which is
  // what let a `where("domain","!=",null)` query or a direct read drift from local).
  const norm = normalizeProjectPatch(patch);
  const updatedAt = new Date().toISOString();
  const write: Record<string, unknown> = { updatedAt };
  const merged: FirebaseFirestore.DocumentData = { ...doc.data(), updatedAt };
  for (const [k, v] of Object.entries(norm)) {
    if (v === null) {
      write[k] = FieldValue.delete();
      delete merged[k];
    } else {
      write[k] = v;
      merged[k] = v;
    }
  }
  await ref.set(write, { merge: true });
  return toProject(projectId, merged);
}

/** Delete a project. (Data modules still key on the per-user tenant in v1, so
 *  this removes the workspace entry, not campaign/social data.) */
export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await projectsCol(userId).doc(projectId).delete();
}
