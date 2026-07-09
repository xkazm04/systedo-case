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
import { useMemo, useState } from "react";
import { useProject } from "@/lib/projects/context";
import SpeedLeadModule from "@/components/app/modules/SpeedLeadModule";
import TwinOutbox from "@/components/app/twin/TwinOutbox";
import NextSteps from "@/components/app/NextSteps";
import { useTwinState, type TwinSource } from "@/components/app/twin/useTwinState";
import { useT } from "@/lib/i18n/client";
import { parseReplySeed, replySeedKey } from "@/lib/twin/reply-seed";
import { voiceToWire } from "@/lib/twin/wire";
import { isModuleAvailable } from "@/lib/projects/modules";
import {
  avoidDirectives,
  rejectionPatterns,
  resolveVoice,
  type TwinChannel,
  type TwinState,
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

  const { state, commit } = useTwinState(initialState, initialSource);
  const seed = useReplySeed(project.id);

  const leadsEnabled = state.channels.some((c) => c.channel === "leads" && c.enabled);
  const [channel, setChannel] = useState<TwinChannel>(
    seed?.channel ?? (leadsEnabled ? "leads" : (state.channels.find((c) => c.enabled)?.channel ?? "email"))
  );

  /** The voice the `leads` inbox writes in — its own, else the generic register —
   *  plus what humans have already rejected there, so the twin stops repeating it. */
  const leadsVoice = resolveVoice(state.voices, "leads");
  const leadsAvoid = useMemo(() => avoidDirectives(rejectionPatterns(state.drafts, "leads")), [state.drafts]);

  return (
    <div className="stagger space-y-6">
      <TwinOutbox
        state={state}
        projectType={projectType}
        channel={channel}
        onChannel={setChannel}
        onCommit={commit}
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
