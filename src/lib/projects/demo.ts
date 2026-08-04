/** Demo-ness — the one seam that decides whether a project id is a reserved
 *  demo/marketing fixture or a real tenant's workspace.
 *
 *  The distinction is load-bearing and asymmetric in its failure modes: a demo id
 *  treated as a tenant writes fixture content into a customer's data; a tenant id
 *  treated as demo publishes a customer's data onto the public marketing surface.
 *  Yet the ONLY thing separating the two is that a demo id begins with `demo-` —
 *  not a column, not a field on the record.
 *
 *  So the prefix is tested in exactly ONE function in this file
 *  ({@link resolveProjectKind}), and every other consumer — the predicates below,
 *  the write-path guard in ./persist-guard, the demo fixtures themselves — derives
 *  from it. Nothing else in the codebase may spell the prefix; a structural test
 *  (test-unit/projects-demo-seam.test.mjs) fails the suite if it does.
 *
 *  The `demo-` id convention REMAINS the storage-level truth — this is a resolver,
 *  not a data migration, and no id is renamed. What changes is that demo-ness is now
 *  a typed property (`ProjectKind`, and the branded {@link TenantProjectId} a write
 *  path must hold) rather than a string test each call site re-derives and can
 *  forget.
 *
 *  Framework-free (no React, no store) so both the client shell and the server
 *  modules can import it. Pure — unit-tested. */

/** The reserved id namespace for the read-only marketing/demo projects. Private on
 *  purpose: {@link resolveProjectKind} is the only reader, and {@link demoProjectId}
 *  the only writer. Exported ONLY so the seam's own unit test can pin the constant —
 *  never for a call site to re-implement the check with. */
export const DEMO_ID_PREFIX = "demo-";

/** What a project id IS. A demo project is never owned, never persisted and never
 *  connected to a live source; its catalog, warehouse badge, action plan etc. stay
 *  illustrative. A tenant project is a real, owned workspace. */
export type ProjectKind = "demo" | "tenant";

declare const TENANT_PROJECT_BRAND: unique symbol;

/** A project id PROVEN not to be a demo id. Nominal by construction: the only way to
 *  obtain one is {@link asTenantProjectId} (or the write-path guard that wraps it),
 *  so a function that demands one cannot be handed an unchecked string by accident.
 *  It is still a `string` at runtime and assignable to `string`, so stores take it
 *  unchanged — the brand costs nothing and buys the compile-time proof. */
export type TenantProjectId = string & { readonly [TENANT_PROJECT_BRAND]: true };

/** A resolved project identity — the typed property that replaces the repeated
 *  string test. Discriminated, so a `switch`/`if` on `kind` narrows the id too. */
export type ProjectRef =
  | { kind: "demo"; id: string }
  | { kind: "tenant"; id: TenantProjectId };

/** THE seam. The only prefix test in the codebase; everything below derives from it. */
export function resolveProjectKind(id: string): ProjectKind {
  return id.startsWith(DEMO_ID_PREFIX) ? "demo" : "tenant";
}

/** Resolve an id to its typed identity. Prefer this where a caller branches on the
 *  kind AND needs the id afterwards — the tenant branch hands back a branded id. */
export function projectRef(id: string): ProjectRef {
  return resolveProjectKind(id) === "demo"
    ? { kind: "demo", id }
    : { kind: "tenant", id: id as TenantProjectId };
}

/** The id as a tenant id, or null when it is a demo id (or empty). The gate every
 *  persisting path goes through — directly, or via ./persist-guard which also proves
 *  ownership. */
export function asTenantProjectId(id: string): TenantProjectId | null {
  if (!id) return null;
  return resolveProjectKind(id) === "tenant" ? (id as TenantProjectId) : null;
}

/** The reserved id for a demo project of some flavour — the one place a demo id is
 *  MINTED, so the prefix has a single writer as well as a single reader. */
export function demoProjectId(flavour: string): string {
  return `${DEMO_ID_PREFIX}${flavour}`;
}

/** True for a reserved demo/marketing project id. Read-side sugar over the seam —
 *  fine for presentation branching; a WRITE path must use {@link asTenantProjectId}
 *  or the ownership guard, which cannot be forgotten the way a negated predicate can. */
export function isDemoProjectId(id: string): boolean {
  return resolveProjectKind(id) === "demo";
}

/** True for a reserved demo/marketing project record. */
export function isDemoProject(project: { id: string }): boolean {
  return isDemoProjectId(project.id);
}
