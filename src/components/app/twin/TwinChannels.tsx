"use client";

/** Per-channel configuration: on/off, how much autonomy the twin gets, which
 *  connector delivers an approved draft, and (for `auto`) the confidence bar a
 *  draft must clear to skip human review.
 *
 *  The honesty rule this screen enforces: `auto` never means "fire and forget".
 *  A draft self-approves only above the threshold AND with zero flagged risks
 *  (lib/twin/types `decideDraft`), and with only the `manual` connector configured
 *  nothing is actually transmitted — the copy says so rather than implying a
 *  delivery that doesn't happen. */
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { Info } from "@/components/icons";
import type { ConnectorInfo } from "@/lib/twin/connectors";
import {
  AUTONOMY_LEVELS,
  channelConfig,
  DEFAULT_AUTO_THRESHOLD,
  TWIN_CHANNELS,
  type Autonomy,
  type TwinChannel,
  type TwinChannelConfig,
  type TwinState,
} from "@/lib/twin/types";

const T = {
  cs: {
    intro:
      'Kde twin mluví a jak moc mu věříte. „Samostatně" znamená: twin odpověď schválí sám, ale jen když si je jistý nad zvolenou hranicí a nenajde žádné riziko. Cokoli jiného počká na vás.',
    enabled: "Zapnuto",
    autonomy: "Samostatnost",
    connector: "Doručení",
    threshold: "Hranice jistoty",
    notConfigured: "nenastaveno",
    manualWarning:
      "Zatím není připojený žádný odesílací konektor. Schválené zprávy si zkopírujete a odešlete sami — Adamant nic neodesílá.",
    autonomyReview: "Jen člověk",
    autonomyAssist: "Twin píše, člověk schvaluje",
    autonomyAuto: "Samostatně",
    autonomyReviewHint: "Twin na tomto kanálu nepíše.",
    autonomyAssistHint: "Twin připraví návrh, odeslat ho může jen člověk.",
    autonomyAutoHint: "Twin schválí sám, pokud je jistota nad hranicí a nenajde riziko.",
  },
  en: {
    intro:
      "Where the twin speaks and how far you trust it. “Autonomous” means: the twin approves its own reply, but only above the confidence bar you set and with zero risks found. Anything else waits for you.",
    enabled: "Enabled",
    autonomy: "Autonomy",
    connector: "Delivery",
    threshold: "Confidence bar",
    notConfigured: "not configured",
    manualWarning:
      "No send connector is wired up yet. You copy approved messages and send them yourself — Adamant transmits nothing.",
    autonomyReview: "Human only",
    autonomyAssist: "Twin drafts, human approves",
    autonomyAuto: "Autonomous",
    autonomyReviewHint: "The twin does not draft on this channel.",
    autonomyAssistHint: "The twin prepares a draft; only a human can send it.",
    autonomyAutoHint: "The twin self-approves when confidence clears the bar and no risk is found.",
  },
} as const;

const CHANNEL_LABELS: Record<TwinChannel, { cs: string; en: string }> = {
  leads: { cs: "Poptávky", en: "Enquiries" },
  email: { cs: "E-mail", en: "Email" },
  chat: { cs: "Chat", en: "Chat" },
  social: { cs: "Sociální sítě", en: "Social" },
  reviews: { cs: "Recenze", en: "Reviews" },
  sms: { cs: "SMS", en: "SMS" },
  whatsapp: { cs: "WhatsApp", en: "WhatsApp" },
};

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
  onCommit: (next: TwinState) => void;
}) {
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  /** Upsert one channel's config, leaving the others alone. */
  const update = (channel: TwinChannel, patch: Partial<TwinChannelConfig>) => {
    const current = channelConfig(state.channels, channel);
    const next: TwinChannelConfig = { ...current, ...patch };
    onCommit({
      ...state,
      channels: [...state.channels.filter((c) => c.channel !== channel), next],
    });
  };

  const anyRealConnector = connectors.some((c) => c.configured && c.id !== "manual");

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-muted">{t("intro")}</p>

      {!anyRealConnector && (
        <div className="flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3">
          <Info width={16} height={16} className="mt-0.5 shrink-0 text-muted" />
          <p className="text-sm leading-relaxed text-navy-700">{t("manualWarning")}</p>
        </div>
      )}

      <ul className="space-y-3">
        {TWIN_CHANNELS.map((channel) => {
          const cfg = channelConfig(state.channels, channel);
          const available = connectors.filter((c) => c.channels.includes(channel));
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
                <span className="pill bg-navy-50 text-muted">{t(AUTONOMY_LABEL[cfg.autonomy])}</span>
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

                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor={`connector-${channel}`}
                        className="text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        {t("connector")}
                      </label>
                      <select
                        id={`connector-${channel}`}
                        value={cfg.connector}
                        onChange={(e) => update(channel, { connector: e.target.value })}
                        className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                      >
                        {available.map((c) => (
                          <option key={c.id} value={c.id} disabled={!c.configured}>
                            {(L === "en" ? c.labelEn : c.label) + (c.configured ? "" : ` (${t("notConfigured")})`)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {cfg.autonomy === "auto" && (
                      <div>
                        <label
                          htmlFor={`threshold-${channel}`}
                          className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted"
                        >
                          <span>{t("threshold")}</span>
                          <span className="tnum text-navy-800">{cfg.autoThreshold} %</span>
                        </label>
                        <input
                          id={`threshold-${channel}`}
                          type="range"
                          min={50}
                          max={100}
                          step={5}
                          value={cfg.autoThreshold ?? DEFAULT_AUTO_THRESHOLD}
                          onChange={(e) => update(channel, { autoThreshold: Number(e.target.value) })}
                          className="mt-1.5 w-full accent-brand-600"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
