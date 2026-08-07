"use client";

/** The channel detail modal: playbook (why / payoff / first steps) + the
 *  lifecycle controls — mode summary, stage transitions and the derived
 *  next-step CTA. The row's single source of "what do I do here". */
import Link from "next/link";
import Modal from "@/components/app/Modal";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { ArrowRight, Bolt, Broadcast, Cog, Link as LinkIcon } from "@/components/icons";
import {
  channelKind,
  type ChannelStage,
  type ChannelTrack,
  type OrganicChannel,
} from "@/lib/organic-channels/types";
import type { ChannelNext } from "@/lib/organic-channels/next-step";
import { CATEGORY_LABELS, EFFORT_LABELS, MODE_LABELS, NEXT_LABELS, STAGE_LABELS } from "./labels";

const T = {
  cs: {
    why: "Proč právě tento kanál",
    payoff: "Co přinese",
    firstSteps: "První kroky",
    visit: "Otevřít kanál",
    nextStep: "Další krok",
    setup: "Nastavení",
    changeSetup: "Změnit nastavení",
    cadence: "max {n}× týdně",
    stageSet: "Stav:",
    createContent: "Vytvořit obsah pro tento kanál",
    fitLabel: "Vhodnost",
    effortLabel: "Náročnost",
    pending: "{n} čeká",
  },
  en: {
    why: "Why this channel",
    payoff: "What it delivers",
    firstSteps: "First steps",
    visit: "Open channel",
    nextStep: "Next step",
    setup: "Setup",
    changeSetup: "Change setup",
    cadence: "max {n}× a week",
    stageSet: "Status:",
    createContent: "Create content for this channel",
    fitLabel: "Fit",
    effortLabel: "Effort",
    pending: "{n} waiting",
  },
} as const;

/** Stage transitions the modal offers per current stage — lifecycle-legal moves
 *  only (decide/go-live flow through the wizard + next-step CTA, not here). */
const STAGE_MOVES: Record<ChannelStage, ChannelStage[]> = {
  identified: [],
  planned: ["live", "paused"],
  live: ["paused", "done"],
  paused: ["live", "done"],
  done: ["live"],
};

export default function ChannelPlaybook({
  channel,
  track,
  next,
  projectId,
  degraded,
  onClose,
  onSetStage,
  onOpenWizard,
  onCreateContent,
}: {
  channel: OrganicChannel | null;
  track: ChannelTrack | undefined;
  next: ChannelNext | null;
  projectId: string;
  degraded: boolean;
  onClose: () => void;
  onSetStage: (id: string, stage: ChannelStage) => void;
  onOpenWizard: (channel: OrganicChannel) => void;
  onCreateContent: (channel: OrganicChannel) => void;
}) {
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  const stage = track?.stage ?? "identified";

  /** Resolve the next-step CTA into an action: a deep-link when it targets
   *  another module, else the matching local handler. */
  const nextAction = () => {
    if (!channel || !next || next.key === "none") return null;
    if (next.to) {
      return (
        <Link
          href={`/app/${projectId}/${next.to}?from=kanaly&channel=${channel.id}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99]"
        >
          {NEXT_LABELS[next.key][L]}
          {next.count ? <span className="pill bg-white/20 text-white">{t("pending", { n: next.count })}</span> : null}
          <ArrowRight width={16} height={16} />
        </Link>
      );
    }
    const local: Partial<Record<typeof next.key, () => void>> = {
      decide: () => onOpenWizard(channel),
      "set-inbox": () => onOpenWizard(channel),
      "first-action": undefined, // the playbook IS the first-action surface
      "go-live": () => onSetStage(channel.id, "live"),
      "mark-done": () => onSetStage(channel.id, "done"),
      resume: () => onSetStage(channel.id, "live"),
    };
    const handler = local[next.key];
    if (!handler) return null;
    return (
      <button
        type="button"
        onClick={handler}
        disabled={degraded}
        className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {NEXT_LABELS[next.key][L]}
        <ArrowRight width={16} height={16} />
      </button>
    );
  };

  return (
    <Modal
      open={channel !== null}
      onClose={onClose}
      title={
        channel ? (
          <span className="flex items-center gap-2">
            <Broadcast width={18} height={18} className="text-brand-accent" />
            {channel.name}
          </span>
        ) : undefined
      }
      description={
        channel
          ? `${CATEGORY_LABELS[channel.category][L]} · ${t("fitLabel")} ${channel.fit} · ${t("effortLabel")} ${EFFORT_LABELS[channel.effort][L]}`
          : undefined
      }
      size="md"
    >
      {channel && (
        <div className="space-y-5">
          {/* Lifecycle header: stage + mode + cadence, with the wizard re-entry */}
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-canvas px-4 py-3">
            <span className={`pill ${STAGE_LABELS[stage].tone}`}>{STAGE_LABELS[stage][L]}</span>
            {track?.mode && <span className={`pill ${MODE_LABELS[track.mode].tone}`}>{MODE_LABELS[track.mode][L]}</span>}
            {track?.maxPerWeek && channelKind(channel.category) !== "listing" && (
              <span className="pill bg-navy-50 text-muted">{t("cadence", { n: track.maxPerWeek })}</span>
            )}
            <button
              type="button"
              onClick={() => onOpenWizard(channel)}
              disabled={degraded}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Cog width={12} height={12} />
              {track?.mode ? t("changeSetup") : t("setup")}
            </button>
          </div>

          {nextAction() && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("nextStep")}</p>
              {nextAction()}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("why")}</p>
            <p className="mt-1 text-sm leading-relaxed text-navy-700">{channel.rationale}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("payoff")}</p>
            <p className="mt-1 text-sm leading-relaxed text-navy-700">{channel.payoff}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("firstSteps")}</p>
            <ol className="mt-2 space-y-2">
              {channel.firstActions.map((a, i) => (
                <li key={i} className="flex gap-3 text-sm text-navy-700">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{a}</span>
                </li>
              ))}
            </ol>
          </div>

          {channel.url && (
            <a
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent hover:text-brand-800"
            >
              <LinkIcon width={14} height={14} />
              {t("visit")}
            </a>
          )}

          {/* Stage transitions (lifecycle-legal moves only) */}
          {STAGE_MOVES[stage].length > 0 && (
            <div className="rounded-card border border-line bg-canvas px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("stageSet")}</p>
              <div className="flex flex-wrap gap-2">
                {STAGE_MOVES[stage].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => onSetStage(channel.id, st)}
                    disabled={degraded}
                    className="rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-navy-200 hover:text-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {STAGE_LABELS[st][L]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => onCreateContent(channel)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-pill border border-line px-5 py-3 text-sm font-semibold text-navy-800 transition-colors hover:border-navy-200"
          >
            <Bolt width={16} height={16} />
            {t("createContent")}
            <ArrowRight width={16} height={16} />
          </button>
        </div>
      )}
    </Modal>
  );
}
