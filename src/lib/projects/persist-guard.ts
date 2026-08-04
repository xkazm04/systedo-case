/** The ownership guard for PERSISTING Server Actions — the write-path twin of
 *  ./api-guard (which does the same job for `/api/projects/[id]/**` routes, in the
 *  Response-returning shape a route needs).
 *
 *  Every module that saves per-project state from a Server Action needs the same
 *  three checks before it may touch a store: the id must not be a demo/marketing
 *  fixture, the caller must be signed in, and the project must be theirs. Those
 *  three lines were hand-copied into every such action file — the newest one even
 *  documents that it copied the previous one "so the two guards can be compared line
 *  by line". Copies drift, and the one that drifts writes demo content into a real
 *  tenant or a real tenant's content onto the public surface.
 *
 *  This is now the ONE place that handshake lives. It hands back a BRANDED
 *  {@link TenantProjectId} rather than a plain string, so what a caller receives is
 *  proof it went through the seam — not a convention it could have skipped. A
 *  structural test (test-unit/projects-demo-seam.test.mjs) fails the suite if a
 *  `"use server"` module re-inlines the handshake instead of calling this.
 *
 *  Behaviour is byte-identical to the copies it replaces: a demo id, an anonymous
 *  caller and a foreign project all resolve to null, and the action no-ops. Server-only
 *  (it reads the request session). */
import "server-only";
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { asTenantProjectId, type TenantProjectId } from "@/lib/projects/demo";
import type { Project } from "@/lib/projects/types";

/** A project the signed-in caller owns AND that is safe to persist to. */
export interface OwnedTenantProject {
  /** the signed-in owner */
  uid: string;
  /** the project id, proven to be a real tenant's (never a demo fixture) */
  projectId: TenantProjectId;
  /** the resolved record, for callers that need its type/name */
  project: Project;
}

/** The caller's owned, persistable project — or null when the write must no-op
 *  (empty id, a demo/marketing id, not signed in, or not their project).
 *
 *  Demo ids are rejected BEFORE the store is touched: they are never owned, so the
 *  ownership read would refuse them anyway, but failing fast keeps the marketing
 *  surface from issuing a pointless per-render lookup and makes the intent explicit
 *  at the seam instead of implicit in a store miss. */
export async function requireOwnedTenantProject(
  projectId: string
): Promise<OwnedTenantProject | null> {
  const tenantId = asTenantProjectId(projectId);
  if (!tenantId) return null;
  const uid = await currentUserId();
  if (!uid) return null;
  const project = await getProject(uid, tenantId);
  if (!project) return null;
  return { uid, projectId: tenantId, project };
}
