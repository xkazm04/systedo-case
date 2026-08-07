/** The signpost brain: given a channel, its tracked lifecycle and a snapshot of
 *  the communication modules' real state, derive the ONE next step. Stage stores
 *  intent; readiness is computed here from what the Twin/schranka modules
 *  actually persist — so the Kanály signpost can never disagree with them.
 *  Framework-free and pure (unit-tested); the UI maps keys to labels/hrefs. */
import {
  channelKind,
  type ChannelTrack,
  type OrganicChannel,
} from "./types";

/** Snapshot of the other modules' state the derivation reads. Assembled
 *  server-side by the kanaly page from resolveTwin (voices, channel configs,
 *  pending drafts) and passed down — plain data, client-safe. */
export interface SignpostContext {
  /** twin voice scopes with non-empty trained directives */
  trainedScopes: readonly string[];
  /** twin channels enabled in sprava-kanalu */
  enabledTwinChannels: readonly string[];
  /** pending (unreviewed) schranka drafts per twin channel */
  pendingByChannel: Record<string, number>;
}

export type ChannelNextKey =
  | "decide" // pick manual/twin — opens the setup wizard
  | "train-voice" // twin scope has no trained voice → Twin voice studio
  | "enable-channel" // twin channel disabled → sprava-kanalu
  | "set-inbox" // conversational, no inbox source → wizard inbox step
  | "first-action" // manual setup done → work the playbook, then go live
  | "go-live" // twin fully wired → flip the switch
  | "check-inbox" // live conversational → schranka (with pending count)
  | "create-content" // live content/pr channel → draft the next piece
  | "mark-done" // live listing → it ships once; close it out
  | "resume" // paused
  | "none"; // done

export interface ChannelNext {
  key: ChannelNextKey;
  /** module route segment to deep-link (absent = the action happens in kanaly) */
  to?: "twin" | "sprava-kanalu" | "schranka" | "obsahovy-engine" | "socialni";
  /** pending-draft count for "check-inbox" badges */
  count?: number;
}

/** Twin scope a channel maps to by default when the user picks twin mode. */
export function suggestedTwinScope(channel: OrganicChannel): string {
  return channelKind(channel.category) === "pr" ? "email" : "social";
}

/** Mode the wizard pre-selects, by kind: listings are one-shot manual work,
 *  conversational channels are where the twin earns its keep. */
export function suggestedMode(channel: OrganicChannel): "manual" | "twin" {
  return channelKind(channel.category) === "conversational" ? "twin" : "manual";
}

export function deriveChannelNext(
  channel: OrganicChannel,
  track: ChannelTrack | undefined,
  ctx: SignpostContext
): ChannelNext {
  const stage = track?.stage ?? "identified";
  if (stage === "identified") return { key: "decide" };
  if (stage === "paused") return { key: "resume" };
  if (stage === "done") return { key: "none" };

  const kind = channelKind(channel.category);

  if (stage === "planned") {
    if (track?.mode === "twin") {
      const scope = track.twinScope ?? suggestedTwinScope(channel);
      if (!ctx.trainedScopes.includes(scope)) return { key: "train-voice", to: "twin" };
      if (!ctx.enabledTwinChannels.includes(scope)) return { key: "enable-channel", to: "sprava-kanalu" };
      if (kind === "conversational" && !track.inboxSource) return { key: "set-inbox" };
      return { key: "go-live" };
    }
    return { key: "first-action" };
  }

  // stage === "live"
  if (kind === "listing") return { key: "mark-done" };
  if (kind === "conversational" && (track?.mode === "twin" || track?.inboxSource)) {
    const scope = track?.twinScope ?? suggestedTwinScope(channel);
    const count = ctx.pendingByChannel[scope] ?? 0;
    return { key: "check-inbox", to: "schranka", ...(count > 0 ? { count } : {}) };
  }
  // Content, PR and manual conversational channels all continue by producing the
  // next piece; social-category channels draft in the social planner.
  return { key: "create-content", to: channel.category === "social" ? "socialni" : "obsahovy-engine" };
}