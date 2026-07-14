/** Route-scaffolding kit for the project & workspace API handlers
 *  (`src/app/api/projects/**`). Small, dependency-light helpers that used to be
 *  copy-pasted per route: a safe JSON-body parse, wire-value → string coercion, and
 *  the bare `{ error }` 4xx response builders. Pure and framework-agnostic (no
 *  session/db reads), so it is safe to import from unit tests as well as handlers.
 *
 *  ── New-route recipe ──────────────────────────────────────────────────────────
 *    export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
 *      const { id } = await params;
 *      const g = await requireOwnedProject(id);        // ownership (see api-guard.ts)
 *      if ("error" in g) return g.error;
 *      const { uid } = g;
 *
 *      const body = await readJson<{ name?: unknown }>(req);   // null on malformed JSON
 *      const name = trimmedString(body?.name);                // "" when absent/non-string
 *      if (!name) return badRequest("Zadejte název.");        // 400 → malformed/absent input
 *      // …validate the shape; a well-formed body that fails semantic validation →
 *      //   return unprocessable("…");                        // 422 → body-validation failure
 *      …
 *    }
 *
 *  ── Status convention (see also api-guard.ts) ─────────────────────────────────
 *    400  malformed / missing / unparseable input (bad JSON, missing required id/name)
 *    422  a well-formed body that fails semantic validation (a sanitiser rejects it)
 *    401 / 404  authentication / ownership — produced by requireOwnedProject
 *
 *  ── Envelope note ─────────────────────────────────────────────────────────────
 *    These builders emit the bare `{ error }` envelope used by the projects-root,
 *    catalog, duplicate, warehouse and state routes. Routes that answer with the
 *    `{ ok: false, error }` envelope keep their inline literals for now — unifying
 *    the two envelopes is a separate, later direction, so do NOT force this builder
 *    onto an `{ ok }` route (it would change the response body). */
import { PROJECT_TYPES, type ProjectType } from "@/lib/projects/types";

/** Parse a JSON request body, returning `null` on any malformed/absent/unparseable
 *  body. Replaces the `await req.json().catch(() => null)` idiom repeated per route. */
export async function readJson<T = unknown>(req: Request): Promise<T | null> {
  return (await req.json().catch(() => null)) as T | null;
}

/** Coerce an unknown wire value to a string: the value when it is a string, else `""`.
 *  (No trimming — mirrors `typeof v === "string" ? v : ""`.) */
export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Like {@link asString} but trims (mirrors `typeof v === "string" ? v.trim() : ""`). */
export function trimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Type guard: is `v` one of the known {@link ProjectType} values? Deduped from the
 *  copies that lived in both the projects-root and `[id]` route handlers. */
export function isProjectType(v: unknown): v is ProjectType {
  return typeof v === "string" && (PROJECT_TYPES as readonly string[]).includes(v);
}

/** 400 Bad Request — bare `{ error }`. Malformed / missing / unparseable input. */
export function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

/** 404 Not Found — bare `{ error }`. */
export function notFound(error: string): Response {
  return Response.json({ error }, { status: 404 });
}

/** 422 Unprocessable Entity — bare `{ error }`. A well-formed body that fails
 *  semantic validation. */
export function unprocessable(error: string): Response {
  return Response.json({ error }, { status: 422 });
}
