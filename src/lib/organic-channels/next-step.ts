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
import { voiceTrainedAt } from "@/lib/twin/voice-age";
import type { TwinState } from "@/lib/twin/types";

/** Snapshot of the other modules' state the derivation reads. Assembled
 *  server-side by the kanaly page via {@link buildSignpostContext} (from
 *  resolveTwin's voices/channel configs/pending drafts) and passed down —
 *  plain data, client-safe. */
export interface SignpostContext {
  /** twin voice scopes the TENANT actually trained (see buildSignpostContext) */
  trainedScopes: readonly string[];
  /** twin channels the tenant enabled in sprava-kanalu (seed defaults excluded) */
  enabledTwinChannels: readonly string[];
  /** pending (unreviewed) schranka drafts per twin channel */
  pendingByChannel: Record<string, number>;
}

/** Build the SignpostContext from the resolved twin plus the RAW saved twin
 *  state. The two honesty rules live here (unit-tested) so the signpost, the
 *  wizard checklist and the Twin header pill all read the same reality:
 *
 *  - "trained" means the TENANT trained a voice. The scope must be user-saved
 *    (`trainedScopes` — seeded sample rows that `mergeVoices` fills gaps with
 *    don't count) AND actually trained per `voiceTrainedAt` (non-empty
 *    directives + a real timestamp — the seed's EPOCH stamp and an emptied
 *    editor row don't count). Because saved rows win the per-scope merge, any
 *    merged voice with a real training stamp IS the saved row, so this is the
 *    exact per-scope restriction of the Twin header's `hasTrainedVoice` bit —
 *    the two surfaces cannot disagree.
 *
 *  - "enabled" counts only TENANT-CHOSEN channel config. resolveTwin keeps the
 *    seeded channels (all `enabled: true`, a default the app made) whenever
 *    `saved.channels` is empty, so the resolved list alone cannot tell choice
 *    from seed. The honest line is `saved.channels` non-empty: the
 *    sprava-kanalu save persists the whole channel slice, so a non-empty saved
 *    list means the tenant saved channel config at least once — and from that
 *    moment the resolved list is exactly their choice (even where it happens
 *    to equal the seed defaults). Until then, no channel counts as enabled. */
export function buildSignpostContext(
  twin: {
    state: Pick<TwinState, "voices" | "channels" | "drafts">;
    trainedScopes: readonly string[];
  },
  saved: Pick<TwinState, "channels"> | null
): SignpostContext {
  const pendingByChannel: Record<string, number> = {};
  for (const d of twin.state.drafts) {
    if (d.status === "pending") pendingByChannel[d.channel] = (pendingByChannel[d.channel] ?? 0) + 1;
  }
  const tenantChoseChannels = (saved?.channels.length ?? 0) > 0;
  return {
    trainedScopes: twin.state.voices
      .filter((v) => twin.trainedScopes.includes(v.scope) && voiceTrainedAt(v) !== null)
      .map((v) => v.scope),
    enabledTwinChannels: tenantChoseChannels
      ? twin.state.channels.filter((c) => c.enabled).map((c) => c.channel)
      : [],
    pendingByChannel,
  };
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
  /** twin channel the destination should open on ("check-inbox" → schranka's
   *  channel picker) — the granularity the inbox actually has. CTAs append it
   *  as `&channel=<scope>`; schranka reads it. No other step carries one. */
  scope?: string;
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
  ctx: SignpostContext,
  /** whether a module route segment exists for this project's type — the CTA
   *  gate. Defaults to "everything exists" so pure callers/tests stay simple;
   *  the UI passes `isModuleAvailable(projectType, key)` so a derived step can
   *  never deep-link to a notFound() (e.g. `socialni` for leadgen). */
  isAvailable: (moduleKey: string) => boolean = () => true
): ChannelNext {
  /** Honesty gate on the derived deep link: a CTA must never promise a module
   *  the project doesn't have. When the target is unavailable and no equivalent
   *  module exists, fall back to working the channel here — the playbook's
   *  first steps are always real. */
  const guard = (next: ChannelNext): ChannelNext =>
    !next.to || isAvailable(next.to) ? next : { key: "first-action" };

  const stage = track?.stage ?? "identified";
  if (stage === "identified") return { key: "decide" };
  if (stage === "paused") return { key: "resume" };
  if (stage === "done") return { key: "none" };

  const kind = channelKind(channel.category);

  if (stage === "planned") {
    if (track?.mode === "twin") {
      const scope = track.twinScope ?? suggestedTwinScope(channel);
      if (!ctx.trainedScopes.includes(scope)) return guard({ key: "train-voice", to: "twin" });
      if (!ctx.enabledTwinChannels.includes(scope))
        return guard({ key: "enable-channel", to: "sprava-kanalu" });
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
    // `scope` rides along so the schranka CTA can open the inbox on the exact
    // twin channel it counted pending drafts for.
    return guard({ key: "check-inbox", to: "schranka", scope, ...(count > 0 ? { count } : {}) });
  }
  // Content, PR and manual conversational channels all continue by producing the
  // next piece; social-category channels draft in the social planner — but only
  // when the project type HAS the social planner (leadgen doesn't): the content
  // engine (available for every type) is the honest fallback, not a 404.
  const to = channel.category === "social" && isAvailable("socialni") ? "socialni" : "obsahovy-engine";
  return guard({ key: "create-content", to });
}