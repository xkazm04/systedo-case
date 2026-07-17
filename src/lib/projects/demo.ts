/** The reserved id namespace for the read-only marketing/demo projects. A project id
 *  that begins with this prefix is never owned, persisted or connected to live sources
 *  — its catalog, warehouse badge, action plan etc. stay illustrative. The convention
 *  used to live as an inline `project.id.startsWith("demo-")` re-derived at every call
 *  site (badge, plan storage, catalog persistence); centralising it here makes the rule
 *  discoverable and keeps the sibling checks from drifting apart under refactor.
 *
 *  Framework-free (no React, no store) so both the client shell and the server modules
 *  can import it. Pure — unit-tested. */
export const DEMO_ID_PREFIX = "demo-";

/** True for a reserved demo/marketing project id (see {@link DEMO_ID_PREFIX}). */
export function isDemoProjectId(id: string): boolean {
  return id.startsWith(DEMO_ID_PREFIX);
}

/** True for a reserved demo/marketing project (see {@link DEMO_ID_PREFIX}). */
export function isDemoProject(project: { id: string }): boolean {
  return isDemoProjectId(project.id);
}
