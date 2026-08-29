/** Where the ROLLED-UP outcomes live — the thin read/write layer over
 *  `project_state` key "organicOutcomes". The pure rollup is ./outcomes; the click
 *  counters are ./outcomes-store. Server-only.
 *
 *  STORAGE CHOICE (the variants-store precedent, documented for the same reason):
 *  the rollup RIDES the existing `project_state` table rather than adding a third
 *  table on top of `go_links` + `go_clicks`. It is one bounded blob per project —
 *  one row per channel, a handful of integers — recomputed from scratch on every
 *  cron tick, which is exactly what `project_state` exists for ("module state that
 *  used to live only in the browser"). It costs no migration on either backend, and
 *  project deletion already cascades `project_state`, so a deleted project's
 *  outcomes go with it automatically.
 *
 *  The write is a compare-and-swap (`mutateProjectState`) even though only the cron
 *  writes this key: two overlapping ledger invocations are possible by construction
 *  (the retry-step header's at-least-once reasoning applies to every step), and the
 *  CAS makes the losing one recompute rather than clobber. */
import "server-only";
import { getProjectState, mutateProjectState } from "@/lib/project-state/store";
import { PROJECT_STATE_KEYS } from "@/lib/project-state/keys";
import type { ChannelOutcome, OrganicOutcomes } from "./outcomes";

/** The registry key this blob lives under — declared centrally, so a second
 *  feature cannot claim it without a compile error. */
const OUTCOMES_KEY = "organicOutcomes" satisfies keyof typeof PROJECT_STATE_KEYS;

/** Coerce whatever is stored into the blob's shape. A blob written by an older
 *  build (or corrupted) must degrade to "nothing measured", never to a fabricated
 *  number on a panel that claims to be measured. */
export function sanitizeOutcomes(raw: unknown): OrganicOutcomes | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { channels?: unknown; updatedAt?: unknown };
  if (!Array.isArray(o.channels)) return null;
  const channels: ChannelOutcome[] = [];
  for (const item of o.channels) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const channel = typeof c.channel === "string" ? c.channel.trim() : "";
    if (!channel) continue;
    const int = (v: unknown): number => {
      const n = Math.trunc(Number(v));
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    channels.push({
      channel,
      links: int(c.links),
      clicks7d: int(c.clicks7d),
      clicks30d: int(c.clicks30d),
      ...(typeof c.lastClickAt === "string" && c.lastClickAt ? { lastClickAt: c.lastClickAt } : {}),
    });
  }
  return {
    channels,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

/** The project's rolled-up outcomes, or null when the rollup has never run (or the
 *  read failed — the callers all treat both as "nothing measured yet"). */
export async function getOrganicOutcomes(
  userId: string,
  projectId: string
): Promise<OrganicOutcomes | null> {
  return sanitizeOutcomes(await getProjectState<OrganicOutcomes>(userId, projectId, OUTCOMES_KEY));
}

/** Replace the project's rollup with a freshly computed one. */
export async function saveOrganicOutcomes(
  userId: string,
  projectId: string,
  channels: ChannelOutcome[],
  now: Date
): Promise<OrganicOutcomes> {
  return mutateProjectState<OrganicOutcomes>(userId, projectId, OUTCOMES_KEY, () => ({
    channels,
    updatedAt: now.toISOString(),
  }));
}
