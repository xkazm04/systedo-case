/** C3 — save/clear a project's competitor set, fed into the recap + social grounding
 *  so the narrative is comparative. Per-user, ownership-checked. Server-only. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { sanitizeCompetitors } from "@/lib/competitors/types";
import { saveCompetitors, clearCompetitors } from "@/lib/competitors/store";
import { readJson } from "@/lib/api/route-utils";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const body = await readJson(req);
  const clean = sanitizeCompetitors(body);
  if (!clean) {
    return Response.json(
      { ok: false, error: "Zadejte alespoň jednoho konkurenta (jméno)." },
      { status: 400 }
    );
  }

  await saveCompetitors(project.id, {
    competitors: clean.competitors,
    updatedAt: new Date().toISOString(),
  });
  // The cap used to drop the overflow SILENTLY behind a bare `{ok:true}` — the user was
  // told the save succeeded while names vanished. Now the partial save is reported with
  // a stable machine `code` the client maps to its own localized copy (the same
  // partial-success shape the catalog sync uses for its page-cap truncation).
  return Response.json({
    ok: true,
    ...(clean.dropped > 0
      ? {
          warning: {
            code: "competitors-truncated" as const,
            kept: clean.competitors.length,
            dropped: clean.dropped,
          },
        }
      : {}),
  });
}

/** Remove the competitor set → the narrative drops back to self-referential. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;
  await clearCompetitors(project.id);
  return Response.json({ ok: true });
}
