"use client";

/** The signpost's at-a-glance strip: how many channels sit in each lifecycle
 *  stage. Pure presentation over the tracks map — the "current state on first
 *  sight" half of the kanaly signpost. */
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { CHANNEL_STAGES, type ChannelTrack, type OrganicChannel } from "@/lib/organic-channels/types";
import { STAGE_LABELS } from "./labels";

export default function ChannelPipeline({
  channels,
  tracks,
}: {
  channels: OrganicChannel[];
  tracks: Record<string, ChannelTrack>;
}) {
  const { locale } = useLocale();
  const L = locale === "en" ? "en" : "cs";

  const counts = Object.fromEntries(CHANNEL_STAGES.map((s) => [s, 0])) as Record<string, number>;
  for (const c of channels) counts[tracks[c.id]?.stage ?? "identified"]++;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={L === "cs" ? "Stav kanálů" : "Channel pipeline"}>
      {CHANNEL_STAGES.map((stage, i) => (
        <span key={stage} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-line">→</span>}
          <span
            className={`pill ${counts[stage] > 0 ? STAGE_LABELS[stage].tone : "bg-navy-50 text-muted opacity-50"}`}
          >
            <span className="tnum font-semibold">{counts[stage]}</span> {STAGE_LABELS[stage][L]}
          </span>
        </span>
      ))}
    </div>
  );
}
