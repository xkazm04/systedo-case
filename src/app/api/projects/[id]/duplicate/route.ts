/** Duplicate a project as a template: create a fresh, independent project owned by
 *  the signed-in user and copy the source's SETUP (catalog, cost model, competitors,
 *  organic-channels plan, report branding, type + accent) into it — never its
 *  operating data or credentials (see duplicate-cascade.ts). Ownership-checked via
 *  the shared guard; a name is required. Server-only.
 *
 *  A dedicated sub-route (not the projects-root POST) because the two POSTs have
 *  different shapes and preconditions: root/create takes a full type + modules
 *  payload and 401s on no auth; this one takes a single `name`, requires an existing
 *  OWNED source `[id]` (404 otherwise), and returns the derived project — a cleaner
 *  REST shape than overloading create with a `duplicateOf` branch. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { duplicateProject } from "@/lib/projects/duplicate-cascade";
import { emitProjectActivity } from "@/lib/activity/emit";
import { badRequest, notFound, readJson, trimmedString } from "@/lib/api/route-utils";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Ownership: resolves the caller's source project or hands back the 401/404.
  const guard = await requireOwnedProject(id);
  if ("error" in guard) return guard.error;
  const { uid, project: source } = guard;

  const body = await readJson<{ name?: unknown }>(req);
  const name = trimmedString(body?.name);
  if (!name) return badRequest("Zadejte název nového projektu.", "missing-field");

  const result = await duplicateProject(uid, id, name);
  // Defensive: duplicateProject re-checks ownership and only returns null if the
  // source vanished between the guard and the copy.
  if (!result) return notFound("Projekt nenalezen.", "not-found");

  // Audit on the NEW project's feed (best-effort, never throws).
  await emitProjectActivity(uid, result.project.id, {
    kind: "update",
    module: "nastaveni",
    severity: "success",
    title: "Projekt duplikován",
    detail: `Šablona z „${source.name}"`,
    actor: "Vy",
  });

  return Response.json(
    { project: result.project, copied: result.copied, failed: result.failed.map((f) => f.name) },
    { status: 201 }
  );
}
