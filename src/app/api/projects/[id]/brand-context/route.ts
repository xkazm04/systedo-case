/** C1 — the auto-derived brand context for a project (what it sells + how it talks),
 *  so content surfaces (WeekPlanner) can show "the tool knows your brand" and offer
 *  it as the default voice instead of a blank field. Tenancy-checked: a demo id is
 *  public; a real id must belong to the caller. GET → { context }. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { demoProjectById } from "@/lib/demo/projects";
import { isDemoProjectId } from "@/lib/projects/demo";
import { getServerLocale } from "@/lib/i18n/locale";
import { loadBrandContext } from "@/lib/brand/load";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const locale = await getServerLocale();
  if (isDemoProjectId(id)) {
    // Demo-kind by the seam: serve the fixture publicly, or 404 — never a tenant read.
    const demo = demoProjectById(id);
    if (!demo) return Response.json({ error: "Projekt nenalezen.", code: "not-found" }, { status: 404 });
    return Response.json({ context: await loadBrandContext(demo, locale) });
  }

  // Czech messages + machine codes (via the guard), matching the app-wide convention —
  // the client branches on `code`, so these strings are just human fallbacks. The old
  // English "Unauthorized"/"Not found" literals leaked into a Czech surface.
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;

  return Response.json({ context: await loadBrandContext(g.project, locale) });
}
