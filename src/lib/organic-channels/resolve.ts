/** Data-source seam for the organic-channels plan. `resolveOrganicChannels`
 *  returns the project's pinned AI plan when it has one, else the seeded sample —
 *  the single place the Kanály module flips sample→tailored — and always merges in
 *  the tracked per-channel status (the checklist state). Mirrors
 *  local-signals/resolve. Server-only (reads the organic-channels store). */
import "server-only";
import { getOrganicChannels } from "./store";
import type { ChannelStatus, OrganicChannel } from "./types";

export interface ResolvedChannels {
  /** the active plan: the pinned AI plan when present, else the seeded sample */
  channels: OrganicChannel[];
  /** channelId -> tracked status; a missing id means "not-started" */
  statuses: Record<string, ChannelStatus>;
  /** "sample" (seeded, illustrative) or "ai" (a plan the user generated + pinned) */
  source: "sample" | "ai";
  /** ISO timestamp of the last save, when there is saved state */
  updatedAt?: string;
}

/** The active channel plan + statuses for a project: the pinned AI plan when the
 *  project has one, else the passed seeded sample. `sample` is computed by the
 *  caller (channelPlanForProject) so this stays free of the catalog plumbing. */
export async function resolveOrganicChannels(
  projectId: string,
  sample: OrganicChannel[]
): Promise<ResolvedChannels> {
  let state = null;
  try {
    state = await getOrganicChannels(projectId);
  } catch {
    state = null; // store hiccup → sample, never break the module
  }
  if (!state) {
    return { channels: sample, statuses: {}, source: "sample" };
  }
  const pinned = state.plan && state.plan.length > 0;
  return {
    channels: pinned ? state.plan! : sample,
    statuses: state.statuses ?? {},
    source: pinned ? "ai" : "sample",
    updatedAt: state.updatedAt,
  };
}
