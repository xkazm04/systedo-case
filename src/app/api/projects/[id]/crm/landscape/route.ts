/** CRM landscape — the bounded reads behind the Krajina canvas.
 *
 *  Two modes, both over ONE scan of the resolved contact set, both capped:
 *
 *    GET ?axis=source              → clusters + per-cluster stage/SLA mix
 *    GET ?axis=source&key=Sklik    → the dots of ONE cluster (≤ POINT_CAP)
 *
 *  The canvas never asks for "all contacts": the overview is an aggregate and an
 *  expansion is one cluster. `scanned` / `capped` ride along so a slice of a big
 *  project can never be read as the whole project, exactly as `/crm/summary` does.
 *
 *  Resolves through the SAME sample↔live seam as the list (`resolveContacts`), so
 *  a project with no contacts still gets a legible canvas flagged `live: false`.
 *
 *  Per-user, ownership-guarded. Server-only. No LLM call — lead PII must not reach
 *  `generateStructured` (docs/leads/design.md §B7). */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { LIST_SCAN_CAP } from "@/lib/leads/store";
import { resolveContacts } from "@/lib/leads/resolve";
import {
  buildClusters,
  clusterKeyOf,
  isLandscapeAxis,
  layoutPoints,
  POINT_CAP,
} from "@/lib/leads/landscape";
import { apiError } from "@/lib/api/route-utils";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;

  const url = new URL(req.url);
  const axis = url.searchParams.get("axis") ?? "source";
  if (!isLandscapeAxis(axis)) {
    return apiError(400, "Neznámá osa shlukování.", "invalid-type", { envelope: "ok" });
  }
  const key = url.searchParams.get("key");
  const limit = clampNumber(url.searchParams.get("limit"), 1, POINT_CAP, POINT_CAP);

  const resolved = await resolveContacts(g.project, {
    limit: LIST_SCAN_CAP,
    // Tombstones stay in the counts for the same reason `/crm/summary` keeps them:
    // erasing a person must not silently rewrite historic totals. They are never
    // rendered AS a person — `layoutPoints` strips the name of an erased contact.
    includeErased: true,
  });
  const capped = resolved.contacts.length >= LIST_SCAN_CAP;
  const now = Date.now();

  const base = {
    ok: true as const,
    axis,
    live: resolved.live,
    source: resolved.source,
    total: resolved.total,
    scanned: resolved.contacts.length,
    capped,
  };

  if (!key) {
    return Response.json({ ...base, ...buildClusters(resolved.contacts, axis, now) });
  }

  const members = resolved.contacts.filter((c) => clusterKeyOf(c, axis) === key);
  const { points, truncated } = layoutPoints(members, now, limit);
  return Response.json({ ...base, key, count: members.length, points, truncated });
}

function clampNumber(raw: string | null, lo: number, hi: number, fallback: number): number {
  // `Number(null)` is 0, not NaN — an absent param must fall back to the cap, not
  // silently clamp the whole cluster down to a single dot.
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}
