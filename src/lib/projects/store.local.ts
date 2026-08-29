/** Per-user project store — LOCAL node:sqlite backend (the offline dev path).
 *  Projects + users live in `.data/systedo.db` (the same zero-dependency store as
 *  the campaigns feature), so local development needs no Firebase credentials.
 *  Selected by the dispatcher in `store.ts` when LOCAL_DB is on. Server-only.
 *
 *  Mirrors the Firestore backend's interface exactly so call sites are identical;
 *  the table DDL lives in `src/lib/db.ts` (source of truth). */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { ensureLocalUser } from "@/lib/users/local";
import {
  PROJECT_TYPE_META,
  coerceProjectType,
  normalizeProjectPatch,
  type NewProjectInput,
  type Project,
  type ProjectPatch,
} from "./types";

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  accent_color: string;
  logo_url: string | null;
  domain: string | null;
  tenant: string | null;
  ads_customer_id: string | null;
  sklik_linked: number | null;
  created_at: string;
  updated_at: string;
}

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name || "Projekt",
    type: coerceProjectType(r.type),
    accentColor: r.accent_color ?? PROJECT_TYPE_META.eshop.defaultAccent,
    logoUrl: r.logo_url || undefined,
    domain: r.domain || undefined,
    tenant: r.tenant || undefined,
    adsCustomerId: r.ads_customer_id || undefined,
    ...(r.sklik_linked ? { sklikLinked: true } : {}),
    createdAt: r.created_at ?? new Date(0).toISOString(),
    updatedAt: r.updated_at ?? r.created_at ?? new Date(0).toISOString(),
  };
}

/** All of a user's projects, newest first. */
export async function listProjects(userId: string): Promise<Project[]> {
  ensureLocalUser(userId);
  const rows = getDb()
    .prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as unknown as ProjectRow[];
  return rows.map(toProject);
}

/** A single project, or null if it doesn't exist / isn't the user's. */
export async function getProject(userId: string, projectId: string): Promise<Project | null> {
  const r = getDb()
    .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId) as ProjectRow | undefined;
  return r ? toProject(r) : null;
}

/** Create a project and return it (id generated locally, Firestore-ish length). */
export async function createProject(userId: string, input: NewProjectInput): Promise<Project> {
  ensureLocalUser(userId);
  const now = new Date().toISOString();
  const project: Project = {
    id: randomUUID().replace(/-/g, "").slice(0, 20),
    name: input.name.trim() || PROJECT_TYPE_META[input.type].label,
    type: input.type,
    accentColor: input.accentColor || PROJECT_TYPE_META[input.type].defaultAccent,
    ...(input.domain?.trim() ? { domain: input.domain.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO projects
         (id, user_id, name, type, accent_color, domain, tenant, ads_customer_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(project.id, userId, project.name, project.type, project.accentColor, project.domain ?? null, null, null, now, now);
  return project;
}

/** Patch an existing project; returns the updated project or null if missing. */
export async function updateProject(
  userId: string,
  projectId: string,
  patch: ProjectPatch
): Promise<Project | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId) as ProjectRow | undefined;
  if (!row) return null;

  // Normalize once (shared with the Firestore backend) so both persist identically:
  // trims text, empty string on a nullable field → null (clear), key absent → leave.
  const norm = normalizeProjectPatch(patch);
  const next: ProjectRow = {
    ...row,
    name: norm.name ?? row.name,
    type: norm.type ?? row.type,
    accent_color: norm.accentColor ?? row.accent_color,
    logo_url: "logoUrl" in norm ? norm.logoUrl ?? null : row.logo_url,
    domain: "domain" in norm ? norm.domain ?? null : row.domain,
    ads_customer_id: "adsCustomerId" in norm ? norm.adsCustomerId ?? null : row.ads_customer_id,
    sklik_linked: "sklikLinked" in norm ? (norm.sklikLinked ? 1 : 0) : row.sklik_linked,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE projects
       SET name = ?, type = ?, accent_color = ?, logo_url = ?, domain = ?, ads_customer_id = ?, sklik_linked = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    next.name,
    next.type,
    next.accent_color,
    next.logo_url,
    next.domain,
    next.ads_customer_id,
    next.sklik_linked,
    next.updated_at,
    projectId,
    userId
  );
  return toProject(next);
}

/** Delete a project. */
export async function deleteProject(userId: string, projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(projectId, userId);
}
