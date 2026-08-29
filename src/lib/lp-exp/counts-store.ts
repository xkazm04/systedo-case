/** W3-B — the hosted LP experiment's counter persistence: backend DISPATCHER
 *  (ADR-0001). Local node:sqlite when LOCAL_DB is on, else Firestore; the backend is
 *  imported LAZILY so the LOCAL_DB path never evaluates the Firestore module.
 *  Server-only.
 *
 *  ⚠ The counter space is addressed by (experimentId, armId, day) — NOT by tenant.
 *  That is the `go_clicks` shape and it is deliberate for the same reason: the public
 *  page and the public convert beacon answer anonymous visitors, so they must be able
 *  to settle "which counter is this" from what the URL and the served page already
 *  carry, with no tenant to query by. Two consequences, both intended:
 *
 *   • THIS MODULE HOLDS NO OWNERSHIP LOGIC. The authed publish route resolves the
 *     project through the guard FIRST and only then stamps `projectId` onto the rows
 *     it creates (ADR-0002); the public writers supply an experiment/arm pair that the
 *     PUBLISHED PAYLOAD already vouched for, and can move nothing else.
 *   • THE ROWS ARE THE ANALYTICS POSTURE, NOT A LOG — see ./counts.
 *
 *  Both backends owe: upsert-INCREMENT on `bumpLpCount` (never read-modify-write — a
 *  public page's counter is a concurrent write path and two views in the same
 *  millisecond must both land), and deterministic ordering on every capped read
 *  (ADR-0001's capped-read rule). */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { LpArmCountDay, LpCountKind } from "./counts";

function backend() {
  return LOCAL_DB ? import("./counts-store.local") : import("./counts-store.firestore");
}

/** Increment one `(experiment, arm, UTC day)` counter by 1. `projectId` is written
 *  onto the row (never read from the wire — the caller takes it from the published
 *  payload) so the delete cascade can find it later. Best-effort at every call site:
 *  a lost count is a smaller failure than a public page that fails to render. */
export async function bumpLpCount(
  experimentId: string,
  armId: string,
  day: string,
  kind: LpCountKind,
  projectId: string
): Promise<void> {
  return (await backend()).bumpLpCount(experimentId, armId, day, kind, projectId);
}

/** One experiment's counter rows with `day >= sinceDay` (inclusive), ordered
 *  deterministically by (day, armId). */
export async function listLpCountDays(
  experimentId: string,
  sinceDay: string
): Promise<LpArmCountDay[]> {
  if (!experimentId) return [];
  return (await backend()).listLpCountDays(experimentId, sinceDay);
}

/** Every project that currently has counter rows — the sync step's WORK LIST.
 *
 *  Deriving the work list from the counters (rather than scanning every project's
 *  experiments blob) is what keeps the step cheap and bounded: a project with a hosted
 *  page but no traffic yet has nothing to recompute, and a project with no hosted page
 *  at all is never visited. Bounded per call so one tick cannot run unboundedly long. */
export async function listLpCountProjects(limit = 200): Promise<string[]> {
  return (await backend()).listLpCountProjects(limit);
}

/** Drop counter rows older than `beforeDay` (exclusive). Returns how many went. */
export async function pruneLpCounts(beforeDay: string): Promise<number> {
  return (await backend()).pruneLpCounts(beforeDay);
}

/** Drop a project's counter rows — the delete cascade's hook. A deleted project must
 *  not leave live counters accumulating against experiments that no longer exist, and
 *  nothing else in the cascade can find these rows: they are keyed by experiment, and
 *  the experiments blob (`lp-experiments`) is dropped by its own entry. */
export async function clearLpCounts(projectId: string): Promise<void> {
  return (await backend()).clearLpCounts(projectId);
}
