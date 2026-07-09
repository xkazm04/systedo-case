/** Data-source seam for the twin. `resolveTwin` returns the project's trained twin
 *  when it has one, else the seeded per-type sample — the single place the module
 *  flips sample→trained. Server-only (reads the twin store). Mirrors
 *  organic-channels/resolve.
 *
 *  The sample's voices are merged UNDER a saved state rather than replaced, so a
 *  user who trained only the `email` voice still has a sensible `generic` fallback
 *  behind it and `resolveVoice` never returns null on a seeded channel. */
import "server-only";
import { getTwin } from "./store";
import { sampleTwin } from "./sample";
import type { ProjectType } from "@/lib/projects/types";
import type { ToneScope, TwinState, TwinVoice } from "./types";

export interface ResolvedTwin {
  state: TwinState;
  /** "sample" (seeded, untrained) or "trained" (the user has saved something) */
  source: "sample" | "trained";
  updatedAt?: string;
}

/** Saved voices win per scope; the sample fills the scopes the user never touched. */
function mergeVoices(saved: TwinVoice[], seeded: TwinVoice[]): TwinVoice[] {
  const byScope = new Map<ToneScope, TwinVoice>();
  for (const v of seeded) byScope.set(v.scope, v);
  for (const v of saved) byScope.set(v.scope, v);
  return [...byScope.values()];
}

export async function resolveTwin(projectId: string, type: ProjectType): Promise<ResolvedTwin> {
  const seeded = sampleTwin(type);
  let saved: TwinState | null = null;
  try {
    saved = await getTwin(projectId);
  } catch {
    saved = null; // store hiccup → the sample, never break the module
  }
  if (!saved) return { state: seeded, source: "sample" };

  return {
    state: {
      voices: mergeVoices(saved.voices, seeded.voices),
      // A saved twin owns its channel list outright — a user who disabled a seeded
      // channel must not have it resurrected on the next page load.
      channels: saved.channels.length > 0 ? saved.channels : seeded.channels,
      facts: saved.facts,
      drafts: saved.drafts,
    },
    source: "trained",
    updatedAt: saved.updatedAt,
  };
}
