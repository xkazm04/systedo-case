/** CRM aggregate — the counts a module renders ABOVE the list.
 *
 *  Exists because paging through a thousand contacts is not a way to learn what a
 *  pipeline looks like. Counts by stage, source, grade and region, the SLA phase
 *  tally, the response-time band, and the source × stage CROSS-TAB the segment map
 *  renders — all from ONE bounded scan, with `scanned` / `capped` in the payload so
 *  a slice can never be read as the whole project. The cross-tab is deliberately
 *  part of this payload rather than a second endpoint: it is the same pass over
 *  the same contacts, and a second scan would be a second set of numbers to
 *  disagree with.
 *
 *  Resolves through the SAME sample↔live seam as the list (`resolveContacts`), so
 *  a project with no contacts gets an aggregate of the illustrative set flagged
 *  `live: false` rather than an all-zeros screen that looks broken.
 *
 *  Per-user, ownership-guarded. Server-only. No LLM call. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { LIST_SCAN_CAP } from "@/lib/leads/store";
import { resolveContacts } from "@/lib/leads/resolve";
import { summarizeContacts } from "@/lib/leads/summary";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;

  const resolved = await resolveContacts(g.project, {
    limit: LIST_SCAN_CAP,
    // Tombstones stay in the funnel counts on purpose: erasing a person must not
    // silently rewrite historic stage totals (docs/leads/design.md §7).
    includeErased: true,
  });
  const capped = resolved.contacts.length >= LIST_SCAN_CAP;
  const summary = summarizeContacts(resolved.contacts, Date.now(), capped);

  return Response.json({
    ok: true,
    live: resolved.live,
    source: resolved.source,
    total: resolved.total,
    summary,
  });
}
