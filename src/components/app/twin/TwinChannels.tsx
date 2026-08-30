"use client";

/** Per-channel configuration: on/off, and how much autonomy the twin gets. The
 *  delivery half of a channel (connector, confidence bar, weekly cap, consent) lives
 *  in ./TwinChannelDelivery.
 *
 *  The honesty rule this screen enforces: `auto` never means "fire and forget".
 *  A draft self-approves only above the threshold AND with zero flagged risks
 *  (lib/twin/types `decideDraft`).
 *
 *  WP S2 — the banner is now CONDITIONAL, because the old one ("Adamant transmits
 *  nothing") stopped being true the moment a real connector was configured. With no
 *  real connector it still says exactly that; with one, it says the opposite just as
 *  plainly, because a message really can leave from here now. */
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { Info } from "@/components/icons";
import type { ConnectorInfo } from "@/lib/twin/connectors";
import { formatVoiceAge, shouldNudgeRetrain, voiceTrainedAt } from "@/lib/twin/voice-age";
import { CHANNEL_LABELS } from "./labels";
import TwinChannelDelivery from "./TwinChannelDelivery";
import {
  AUTONOMY_LEVELS,
  channelConfig,
  resolveVoice,
  TWIN_CHANNELS,
  type Autonomy,
  type TwinChannel,
  type TwinChannelConfig,
  type TwinCommitSlice,
  type TwinState,
} from "@/lib/twin/types";

const T = {
  cs: {
    intro:
      'Kde twin mluví a jak moc mu věříte. „Samostatně“ znamená: twin odpověď schválí sám, ale jen když si je jistý nad zvolenou hranicí a nenajde žádné riziko. Cokoli jiného počká na vás.',
    enabled: "Zapnuto",
    autonomy: "Samostatnost",
    manualWarning:
      "Zatím není připojený žádný odesílací konektor. Schválené zprávy si zkopírujete a odešlete sami. Adamant nic neodesílá.",
    liveWarning:
      "Je připojený odesílací konektor: schválené zprávy na kanálech s ním opravdu odejdou příjemci. Kanál, kde to nechcete, nechte na „Twin píše, člověk schvaluje“ a hlídejte týdenní limit a souhlas.",
    autonomyReview: "Jen člověk",
    autonomyAssist: "Twin píše, člověk schvaluje",
    autonomyAuto: "Samostatně",
    autonomyReviewHint: "Twin na tomto kanálu nepíše.",
    autonomyAssistHint: "Twin připraví návrh, odeslat ho může jen člověk.",
    autonomyAutoHint: "Twin schválí sám, pokud je jistota nad hranicí a nenajde riziko.",
    trainedAge: "hlas trénován {age}",
    retrainNudge: "K přetrénování",
    retrainNudgeTitle: "Od tréninku hlasu přibyly nové podklady. Zvažte přetrénování.",
  },
  en: {
    intro:
      "Where the twin speaks and how far you trust it. “Autonomous” means: the twin approves its own reply, but only above the confidence bar you set and with zero risks found. Anything else waits for you.",
    enabled: "Enabled",
    autonomy: "Autonomy",
    manualWarning:
      "No send connector is wired up yet. You copy approved messages and send them yourself. Adamant transmits nothing.",
    liveWarning:
      "A send connector is wired up: approved messages on its channels really do go out to the recipient. Leave a channel you don't want that on at “Twin drafts, human approves”, and mind the weekly limit and consent.",
    autonomyReview: "Human only",
    autonomyAssist: "Twin drafts, human approves",
    autonomyAuto: "Autonomous",
    autonomyReviewHint: "The twin does not draft on this channel.",
    autonomyAssistHint: "The twin prepares a draft; only a human can send it.",
    autonomyAutoHint: "The twin self-approves when confidence clears the bar and no risk is found.",
    trainedAge: "voice trained {age}",
    retrainNudge: "Re-train",
    retrainNudgeTitle: "New materials banked since the voice was trained. Consider re-training.",
  },
} as const;

const AUTONOMY_LABEL: Record<Autonomy, keyof (typeof T)["cs"]> = {
  review: "autonomyReview",
  assist: "autonomyAssist",
  auto: "autonomyAuto",
};

const AUTONOMY_HINT: Record<Autonomy, keyof (typeof T)["cs"]> = {
  review: "autonomyReviewHint",
  assist: "autonomyAssistHint",
  auto: "autonomyAutoHint",
};

export default function TwinChannels({
  state,
  connectors,
  onCommit,
}: {
  state: TwinState;
  connectors: ConnectorInfo[];
  /** Apply `next` locally and persist `slice` — this screen only ever commits the
   *  channels section. See useTwinState.commit. */
  onCommit: (next: TwinState, slice?: TwinCommitSlice) => void;
}) {
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  /** Upsert one channel's config, leaving the others alone. */
  const update = (channel: TwinChannel, patch: Partial<TwinChannelConfig>) => {
    const current = channelConfig(state.channels, channel);
    const next: TwinChannelConfig = { ...current, ...patch };
    const channels = [...state.channels.filter((c) => c.channel !== channel), next];
    // The wire carries only the channels slice — a toggle no longer ships the
    // voices/facts/outbox blob (and can no longer clobber another tab's edits there).
    onCommit({ ...state, channels }, { channels });
  };

  const anyRealConnector = connectors.some((c) => c.configured && c.id !== "manual");

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-muted">{t("intro")}</p>

      <div className="flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3">
        <Info width={16} height={16} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-sm leading-relaxed text-navy-700">
          {anyRealConnector ? t("liveWarning") : t("manualWarning")}
        </p>
      </div>

      <ul className="space-y-3">
        {TWIN_CHANNELS.map((channel) => {
          const cfg = channelConfig(state.channels, channel);
          const available = connectors.filter((c) => c.channels.includes(channel));
          // The voice that governs this channel (its own, else the generic register).
          // A trained voice shows its age; a stale one (newer facts banked since)
          // nudges a re-train. Display only — never fed into readiness.
          const voice = resolveVoice(state.voices, channel);
          const trainedAt = voice ? voiceTrainedAt(voice) : null;
          const nudge = voice ? shouldNudgeRetrain(voice, state.facts) : false;
          return (
            <li key={channel} className="rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) => update(channel, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-400"
                  />
                  <span className="text-sm font-semibold text-navy-800">{CHANNEL_LABELS[channel][L]}</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {trainedAt ? (
                    <span className="text-[11px] text-muted">{t("trainedAge", { age: formatVoiceAge(trainedAt, L) })}</span>
                  ) : null}
                  {trainedAt && nudge ? (
                    <span className="pill bg-coral-soft text-coral-600" title={t("retrainNudgeTitle")}>
                      {t("retrainNudge")}
                    </span>
                  ) : null}
                  <span className="pill bg-navy-50 text-muted">{t(AUTONOMY_LABEL[cfg.autonomy])}</span>
                </div>
              </div>

              {cfg.enabled && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("autonomy")}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {AUTONOMY_LEVELS.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => update(channel, { autonomy: a })}
                          aria-pressed={cfg.autonomy === a}
                          className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            cfg.autonomy === a
                              ? "border-brand-400 bg-brand-50 text-brand-800"
                              : "border-line text-muted hover:border-navy-200"
                          }`}
                        >
                          {t(AUTONOMY_LABEL[a])}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted">{t(AUTONOMY_HINT[cfg.autonomy])}</p>
                  </div>

                  <TwinChannelDelivery
                    channel={channel}
                    cfg={cfg}
                    connectors={available}
                    onChange={(patch) => update(channel, patch)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
