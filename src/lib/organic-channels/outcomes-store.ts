/** The organic outcome ledger's persistence — backend DISPATCHER (ADR-0001). Local
 *  node:sqlite when LOCAL_DB is on, else Firestore; the backend is imported LAZILY so
 *  the LOCAL_DB path never evaluates the Firestore module. Server-only.
 *
 *  ⚠ The link registry is GLOBAL, not per-tenant — the microsite registry's shape
 *  (src/lib/microsite/store.ts): `/go/{id}` is a PUBLIC address space, so the key is
 *  the id and the owner rides as a field. That is what lets the public redirect
 *  settle "which link is this" with a single addressable read instead of a query it
 *  has no tenant for. Two consequences, both deliberate:
 *
 *   • THIS MODULE HOLDS NO OWNERSHIP LOGIC. `getGoLink` returns whatever is stored.
 *     The authed routes resolve `projectId` through `requireOwnedProject` FIRST and
 *     only then call in (ADR-0002); the public route reads by id and writes only the
 *     counter, which is why it needs no tenant at all.
 *   • THE CLICK ROWS ARE THE ANALYTICS POSTURE, NOT A LOG. `(linkId, day, count)`
 *     and nothing else — see ./outcomes. There is no row a visitor could be
 *     recovered from because there is no row about a visitor.
 *
 *  Both backends owe: upsert-increment on `bumpGoClick` (never read-modify-write —
 *  the redirect is the app's most concurrent write path), at most one link per id,
 *  and DETERMINISTIC ordering on every capped read (`id` ascending, which is what
 *  Firestore's unordered query gives via `__name__`; ADR-0001's capped-read rule). */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { GoClickDay, GoLink } from "./outcomes";

function backend() {
  return LOCAL_DB ? import("./outcomes-store.local") : import("./outcomes-store.firestore");
}

/** Create-or-replace one link at `link.id`. Idempotent by id. */
export async function saveGoLink(link: GoLink): Promise<void> {
  return (await backend()).saveGoLink(link);
}

/** The link behind a public `/go/{id}`, or null when the id is unknown (→ 404).
 *  Does NOT swallow backend errors: the redirect catches for itself, because a
 *  read failure must 404/500 rather than silently redirect somewhere else. */
export async function getGoLink(id: string): Promise<GoLink | null> {
  return (await backend()).getGoLink(id);
}

/** Every link a project has minted, `id` ascending, capped at GO_LINK_CAP. */
export async function listGoLinks(projectId: string): Promise<GoLink[]> {
  return (await backend()).listGoLinks(projectId);
}

/** Every project's links — the rollup step's work list, bounded so one cron tick
 *  can never run unboundedly long. */
export async function listAllGoLinks(limit = 2000): Promise<GoLink[]> {
  return (await backend()).listAllGoLinks(limit);
}

/** Increment one (link, UTC day) counter by 1. Best-effort at the call site: a lost
 *  count is a smaller failure than a redirect that does not redirect. */
export async function bumpGoClick(linkId: string, day: string): Promise<void> {
  return (await backend()).bumpGoClick(linkId, day);
}

/** Counter rows for these links with `day >= sinceDay` (inclusive). An empty id
 *  list reads as "nothing to ask about" and never hits the backend. */
export async function listGoClickDays(
  linkIds: readonly string[],
  sinceDay: string
): Promise<GoClickDay[]> {
  if (linkIds.length === 0) return [];
  return (await backend()).listGoClickDays(linkIds, sinceDay);
}

/** Drop counter rows older than `beforeDay` (exclusive). Returns how many went. */
export async function pruneGoClicks(beforeDay: string): Promise<number> {
  return (await backend()).pruneGoClicks(beforeDay);
}

/** Drop a project's links AND their counters — the delete cascade's hook. A deleted
 *  project must not leave live public short links behind, which is the same
 *  reasoning that makes the microsite registry non-optional in that cascade.
 *
 *  It does NOT touch the rolled-up `organicOutcomes` blob: that rides `project_state`,
 *  which the SAME cascade drops through its own entry. A future "clear my links"
 *  affordance (there is none today) would have to clear the blob too, or the plan
 *  would keep showing measured badges for links that no longer exist. */
export async function clearGoLinks(userId: string, projectId: string): Promise<void> {
  return (await backend()).clearGoLinks(userId, projectId);
}
