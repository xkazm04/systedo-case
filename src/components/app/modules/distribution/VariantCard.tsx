/** One repurposed variant: copy, inline-edit with a live counter + trim, an AI regenerate through
 *  the `repurpose` tool, and a per-platform handoff that pre-fills the social center.
 *
 *  Layout + intent only — the persisted draft state machine is useVariantDraft,
 *  the AI notices are VariantAiStatus, the UTM row is VariantLinkRow. */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { Calendar, Check, Copy, Refresh, Sparkles } from "@/components/icons";
import type { SourceArticle } from "@/lib/distribution/sample";
import { channelToPlatform } from "@/lib/distribution/handoff";
import { NEWSLETTER_CHANNEL } from "@/lib/distribution/publish";
import type { VariantState, VariantStatus } from "@/lib/distribution/variants";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social/types";
import { useProject } from "@/lib/projects/context";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import { useAiTool } from "@/components/ai/useAiTool";
import type { RepurposeResult, Tone } from "@/lib/ai-types";
import { useT } from "@/lib/i18n/client";
import { useCadenceGuard } from "@/components/social/CadenceNotice";
import NewsletterHandoff from "./NewsletterHandoff";
import VariantAiStatus from "./VariantAiStatus";
import VariantLinkRow from "./VariantLinkRow";
import { useVariantDraft } from "./useVariantDraft";
import { reportDistributionPublish } from "./report-publish";

/** Tone used for the AI repurposing — friendly/human matches the demo content. */
const REPURPOSE_TONE: Tone = "pratelsky";

const T = {
  cs: {
    aiPill: "AI",
    voicePill: "Váš hlas",
    voicePillHint: "Vygenerováno s vaším natrénovaným hlasem z modulu Twin.",
    generateBtn: "Generuji…",
    regenerateBtn: "Vygenerovat znovu",
    rephraseBtn: "Vygenerovat AI variantu",
    variantAriaLabel: "Text varianty pro {channel}",
    trimBtn: "Zkrátit na {max} znaků",
    copied: "Zkopírováno",
    copyBtn: "Kopírovat",
    statusEdited: "Upraveno",
    statusGenerated: "Uloženo",
    statusHandedOff: "Předáno",
    scheduleBtn: "Naplánovat na {platform}",
    schedulingBtn: "Předávám…",
    scheduleError: "Předání do sociálních sítí se nezdařilo.",
    connectError: "Nepodařilo se spojit se serverem.",
  },
  en: {
    aiPill: "AI",
    voicePill: "Your voice",
    voicePillHint: "Generated with your trained voice from the Twin module.",
    generateBtn: "Generating…",
    regenerateBtn: "Regenerate",
    rephraseBtn: "Generate AI variant",
    variantAriaLabel: "Variant text for {channel}",
    trimBtn: "Trim to {max} characters",
    copied: "Copied",
    copyBtn: "Copy",
    statusEdited: "Edited",
    statusGenerated: "Saved",
    statusHandedOff: "Handed off",
    scheduleBtn: "Schedule on {platform}",
    schedulingBtn: "Sending…",
    scheduleError: "Failed to hand off to social networks.",
    connectError: "Could not reach the server.",
  },
} as const;

/** The status label for a stored variant — only rendered once the variant has a
 *  persisted record, so a fresh project shows no badge at all. */
const STATUS_LABEL: Record<VariantStatus, keyof typeof T.en> = {
  generated: "statusGenerated",
  edited: "statusEdited",
  handed_off: "statusHandedOff",
};

export default function VariantCard({
  channel,
  initialText,
  max,
  link,
  source,
  articleKey,
  projectId,
  storedStatus,
  onPersisted,
}: {
  channel: string;
  initialText: string;
  max: number;
  link: string;
  source: SourceArticle;
  /** stable id of the source article — the persistence key (see lib/distribution/variants) */
  articleKey: string;
  projectId: string;
  /** the persisted status for this channel, or null when nothing is stored yet */
  storedStatus: VariantStatus | null;
  onPersisted: (state: VariantState) => void;
}) {
  const t = useT(T);
  const project = useProject();
  const router = useRouter();
  const { copied, copy: copyText } = useCopyFeedback();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cadence = useCadenceGuard();

  const draft = useVariantDraft({
    channel,
    initialText,
    articleKey,
    articleTitle: source.title,
    projectId,
    storedStatus,
    onPersisted,
  });
  const { text, setText, handedOff } = draft;

  // AI repurposing for this single channel (repurpose tool, via /api/ai). The deterministic
  // variant is the initial value + fallback; on success we swap in the model's channel-native
  // text, which still flows through the UTM link, length counter, copy and push-to-social below.
  const ai = useAiTool<RepurposeResult>("repurpose");
  const aiText =
    ai.status === "done"
      ? ai.data?.result.variants.find((v) => v.channel === channel)?.text ?? null
      : null;
  if (aiText && aiText !== draft.generated) draft.applyGenerated(aiText);
  const usingAi = Boolean(aiText) && text === aiText;

  const platform = channelToPlatform(channel);
  const over = text.length > max;

  // Copying the variant IS the asset leaving the app — beacon after the clipboard
  // write resolves, then advance the variant's status.
  const copy = () => {
    void copyText(text).then(() => {
      reportDistributionPublish("copyVariant", channel, project.id);
      handedOff();
    });
  };

  // Ask the model for a fresh, channel-native variant of this article. Pass the
  // article BODY (not just the headline) so the variant repurposes the real content
  // — the tool digests + grounds on it (BM-L1-04).
  const regenerate = () => {
    if (ai.status === "loading") return;
    draft.clearGenerated();
    ai.run({
      title: source.title,
      url: source.url,
      ...(source.body ? { body: source.body } : {}),
      channels: [channel],
      tone: REPURPOSE_TONE,
    });
  };

  async function schedule(override = false) {
    if (!platform || sending || text.trim().length < 2) return;
    setSending(true);
    setError(null);
    try {
      // Pre-fill a post for this platform via the social store's createPost, a few minutes out so
      // it lands as a draft-like scheduled post the user can still edit. No publish beacon here on
      // purpose: scheduling is a promise, not a publish — the event is recorded server-side when the
      // post actually goes out. The route may REFUSE it (409) when it would break the channel's
      // weekly cadence cap; `override` is the operator's answer to that refusal, never ours.
      const scheduledAt = new Date(Date.now() + 30 * 60_000).toISOString();
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, content: text, scheduledAt, projectId: project.id, ...(override ? { overrideCadence: true } : {}) }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!cadence.capture(res.status, json, () => void schedule(true))) setError(json?.error ?? t("scheduleError"));
        return;
      }
      handedOff();
      router.push(`/app/${project.id}/socialni`);
    } catch {
      setError(t("connectError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-navy-800">{channel}</span>
          {usingAi ? (
            <Pill tone="positive">
              <Sparkles width={12} height={12} />
              {t("aiPill")}
            </Pill>
          ) : null}
          {/* Voice disclosure rides the STRUCTURED meta.voiceApplied flag the
              repurpose mode sets when a trained twin voice was actually injected —
              never sniffed from meta.prompt (which also carries the user's own
              prose and would false-claim on an untrained twin). Absent flag =
              no pill, honestly. */}
          {usingAi && ai.data?.meta.voiceApplied ? (
            <Pill tone="brand">
              <span title={t("voicePillHint")}>{t("voicePill")}</span>
            </Pill>
          ) : null}
          {/* Only a variant with a PERSISTED record carries a badge, so a fresh
              project's card is unchanged. */}
          {draft.status ? (
            <Pill tone={draft.status === "handed_off" ? "brand" : "neutral"}>
              {t(STATUS_LABEL[draft.status])}
            </Pill>
          ) : null}
        </span>
        <span className={`tnum text-xs ${over ? "text-negative" : "text-muted"}`}>
          {text.length}/{max}
        </span>
      </div>

      <button
        type="button"
        onClick={regenerate}
        disabled={ai.status === "loading"}
        className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-pill bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
      >
        {ai.status === "loading" ? (
          <>
            <Sparkles width={13} height={13} className="animate-pulse" />
            {t("generateBtn")}
          </>
        ) : usingAi ? (
          <>
            <Refresh width={13} height={13} />
            {t("regenerateBtn")}
          </>
        ) : (
          <>
            <Sparkles width={13} height={13} />
            {t("rephraseBtn")}
          </>
        )}
      </button>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        aria-label={t("variantAriaLabel", { channel })}
        className={`mt-3 w-full flex-1 resize-y rounded-lg border bg-canvas px-3 py-2.5 text-sm leading-relaxed text-navy-700 outline-none transition focus:bg-surface ${
          over ? "border-negative focus:border-negative" : "border-line focus:border-brand-400"
        }`}
      />

      {over && (
        <button
          type="button"
          onClick={() => setText((s) => s.slice(0, max))}
          className="mt-2 self-start text-xs font-semibold text-negative hover:underline"
        >
          {t("trimBtn", { max })}
        </button>
      )}

      <VariantAiStatus
        status={ai.status}
        timedOut={ai.timedOut}
        error={ai.error}
        showDemo={usingAi && Boolean(ai.data?.meta.demo)}
        canRefine={usingAi && ai.canRefine}
        onRefine={ai.refine}
        onRetry={regenerate}
      />

      <VariantLinkRow
        channel={channel}
        link={link}
        onCopied={() => {
          reportDistributionPublish("copyLink", channel, project.id);
          handedOff();
        }}
      />

      {/* Newsletter gets a dedicated handoff: the generated subject line is split into a real
          subject + body, validated separately, exported as HTML email or copied with the UTM'd CTA. */}
      {channel === NEWSLETTER_CHANNEL ? (
        <NewsletterHandoff text={text} ctaUrl={link} source={source} onHandoff={handedOff} />
      ) : null}

      {error && <p className="mt-2 text-xs text-negative">{error}</p>}
      {cadence.notice()}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
        >
          {copied ? (
            <Check width={14} height={14} className="text-positive" />
          ) : (
            <Copy width={14} height={14} />
          )}
          <span>{copied ? t("copied") : t("copyBtn")}</span>
        </button>

        {platform && (
          <button
            type="button"
            onClick={() => void schedule(false)}
            disabled={sending || over || text.trim().length < 2}
            className="inline-flex items-center gap-1.5 rounded-pill bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Calendar width={14} height={14} />
            {sending ? t("schedulingBtn") : t("scheduleBtn", { platform: SOCIAL_PLATFORM_LABELS[platform] })}
          </button>
        )}
      </div>
    </div>
  );
}
