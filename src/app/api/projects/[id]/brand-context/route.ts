/** C1 — the auto-derived brand context for a project (what it sells + how it talks),
 *  so content surfaces (WeekPlanner) can show "the tool knows your brand" and offer
 *  it as the default voice instead of a blank field. Tenancy-checked: a demo id is
 *  public; a real id must belong to the caller. GET → { context }. */
import { auth } from "@/auth";
import { getProject } from "@/lib/projects/store";
import { DEMO_PROJECTS } from "@/lib/demo/projects";
import { getServerLocale } from "@/lib/i18n/locale";
import { loadBrandContext } from "@/lib/brand/load";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const demo = DEMO_PROJECTS.find((p) => p.id === id);
  const locale = await getServerLocale();
  if (demo) {
    return Response.json({ context: await loadBrandContext(demo, locale) });
  }

  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getProject(userId, id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ context: await loadBrandContext(project, locale) });
}
