/** The publishing calendar, read-only: every planned / scheduled / delivered item
 *  across the four schedulers for one project, plus the cadence caps in force.
 *
 *  READ ONLY, ON PURPOSE. There is no POST here and there will not be one: the
 *  calendar is a resolver over four stores that each own their own write path, and
 *  a second door into them would be exactly the fifth store this feature refuses to
 *  become. The cap is ENFORCED at the social write chokepoint
 *  (POST /api/social/posts), not here.
 *
 *  Per-user, ownership-checked; the resolver is keyed by the guard's resolved
 *  project, never by the raw path parameter (two of the four stores are keyed by
 *  projectId ALONE — see their keying invariants). Mirrors the organic-channels
 *  route's auth shape. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { resolvePublishingCalendar } from "@/lib/publishing/resolve";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;
  const { project, uid } = g;

  const q = new URL(request.url).searchParams;
  const from = q.get("from") ?? undefined;
  const to = q.get("to") ?? undefined;
  const calendar = await resolvePublishingCalendar(uid, project.id, { from, to });
  return Response.json(calendar);
}
