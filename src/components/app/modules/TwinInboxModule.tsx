"use client";

/** Schránka zpráv — the app's single review surface for anything the twin writes.
 *
 *  Every channel drafts through the same `twin-reply` op, in the same trained voice,
 *  past the same autonomy gate, into the same approve/reject record. `leads` keeps
 *  its purpose-built inbox (the absorbed Rychlá reakce: SLA clock, BANT
 *  qualification, snippet library); everything else uses the free-form composer.
 *
 *  Other modules hand conversations in here rather than drafting their own replies —
 *  the Socials inbox writes a `replySeedKey` payload and routes here, which is why
 *  the seed is read on mount rather than passed as a prop from the server. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "@/lib/projects/context";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import SpeedLeadModule from "@/components/app/modules/SpeedLeadModule";
import TwinOutbox from "@/components/app/twin/TwinOutbox";
import NextSteps from "@/components/app/NextSteps";
import { useTwinState, type TwinSource } from "@/components/app/twin/useTwinState";
import { useArchivedRejects } from "@/components/app/twin/useArchivedRejects";
import { useT } from "@/lib/i18n/client";
import { parseReplySeed, replySeedKey } from "@/lib/twin/reply-seed";
import { voiceToWire } from "@/lib/twin/wire";
import { upsertDraft } from "@/lib/twin/banking";
import { withArchivedRejects } from "@/lib/twin/archive";
import { isModuleAvailable } from "@/lib/projects/modules";
import {
  channelConfig,
  resolveVoice,
  twinAvoidContext,
  type TwinChannel,
  type TwinDraft,
  type TwinState,
  type TwinStyleFact,
} from "@/lib/twin/types";
import type { InboundLead } from "@/lib/speed-lead/sample";
import type { ProjectType } from "@/lib/projects/types";

const T = {
  cs: {
    stepTwin: "Twin",
    stepTwinHint: "Zpřesněte hlas, kterým twin píše",
    stepChannels: "Správa kanálů",
    stepChannelsHint: "Nastavte samostatnost a doručení",
  },
  en: {
    stepTwin: "Twin",
    stepTwinHint: "Sharpen the voice the twin writes in",
    stepChannels: "Channel management",
    stepChannelsHint: "Set autonomy and delivery",
  },
} as const;

/** Read a hand-off exactly once, during the first render, and clear it — a seed that
 *  survived a back-navigation would silently re-fill the composer with a
 *  conversation the user already dealt with. */
function useReplySeed(projectId: string) {
  const [seed] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const key = replySeedKey(projectId);
      const parsed = parseReplySeed(window.sessionStorage.getItem(key));
      if (parsed) window.sessionStorage.removeItem(key);
      return parsed;
    } catch {
      return null; // storage unavailable — just open unseeded
    }
  });
  return seed;
}

export default function TwinInboxModule({
  state: initialState,
  source: initialSource,
  projectType,
  leads,
  serviceHints,
}: {
  state: TwinState;
  source: TwinSource;
  projectType: ProjectType;
  /** the leads inbox, for the absorbed `leads` channel */
  leads: InboundLead[];
  serviceHints: string[];
}) {
  const project = useProject();
  const t = useT(T);
  const { locale } = useLocale();
  const L = locale === "en" ? "en" : "cs";

  const { state, commit } = useTwinState(initialState, initialSource);
  const seed = useReplySeed(project.id);
  /** Archived rejects (bounded), folded into every rejection tally so learning
   *  survives drafts aging out of the hot blob into history. */
  const archivedRejects = useArchivedRejects(project.id);

  const leadsEnabled = state.channels.some((c) => c.channel === "leads" && c.enabled);
  const [channel, setChannel] = useState<TwinChannel>(
    seed?.channel ?? (leadsEnabled ? "leads" : (state.channels.find((c) => c.enabled)?.channel ?? "email"))
  );

  /** The voice the `leads` inbox writes in — its own, else the generic register —
   *  plus what humans have already rejected there, so the twin stops repeating it. */
  const leadsVoice = resolveVoice(state.voices, "leads");
  const leadsAvoid = useMemo(
    () => twinAvoidContext(withArchivedRejects(state.drafts, archivedRejects), "leads", L),
    [state.drafts, archivedRejects, L]
  );

  /** The `leads` channel's autonomy config + a banking sink, so the SpeedLead inbox
   *  writes its generated replies into the shared outbox through the same gate. An
   *  optional style fact (a banked pre-send edit) rides the SAME commit as the draft,
   *  so the two writes can't race and clobber each other's slice of the blob.
   *  Returns commit's persisted-flag promise: the inbox's send flow must know the
   *  approved record LANDED before asking the server's claim path to mark it sent. */
  const leadsCfg = channelConfig(state.channels, "leads");
  /** Latest committed state, for the async banking path: the send flow banks an
   *  approved draft, AWAITS the save, then banks the server-claimed `sent` flip —
   *  by then the render-time `state` closure is stale and would clobber the first
   *  commit's slice (the approved record, the edit fact). Synced in an effect. */
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const bankLead = (draft: TwinDraft, fact?: TwinStyleFact) => {
    const s = stateRef.current;
    // The wire carries only the changed slice: one draft upsert (+ the optional
    // banked fact) — not the whole voices/facts/outbox blob.
    return commit(
      {
        ...s,
        drafts: upsertDraft(s.drafts, draft),
        ...(fact ? { facts: [...s.facts, fact] } : {}),
      },
      { drafts: [draft], ...(fact ? { addFacts: [fact] } : {}) }
    );
  };

  return (
    <div className="stagger space-y-6">
      <TwinOutbox
        state={state}
        projectType={projectType}
        channel={channel}
        onChannel={setChannel}
        onCommit={commit}
        archivedRejects={archivedRejects}
        initialContact={seed?.contact ?? ""}
        initialInbound={seed?.inbound ?? ""}
      />

      {channel === "leads" && (
        <SpeedLeadModule
          leads={leads}
          serviceHints={serviceHints}
          {...(leadsVoice ? { voice: voiceToWire(leadsVoice) } : {})}
          examples={leadsVoice?.examples ?? []}
          avoid={leadsAvoid}
          leadsCfg={leadsCfg}
          onBankLead={bankLead}
        />
      )}

      <NextSteps
        steps={[
          { to: "twin", label: t("stepTwin"), hint: t("stepTwinHint") },
          { to: "sprava-kanalu", label: t("stepChannels"), hint: t("stepChannelsHint") },
        ].filter((s) => isModuleAvailable(projectType, s.to))}
      />
    </div>
  );
}
