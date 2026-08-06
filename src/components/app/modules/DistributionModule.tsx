/** Distribution — one article repurposed across channels + per-channel attribution.
 *  Each variant is editable: copy to clipboard, tweak inline (with a live
 *  length/limit counter + over-budget trim), and hand off to the social center
 *  pre-filled for the matching platform — no retyping. */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { Bulb, Calendar, Check, Copy, Document, Download, Info, Link, Refresh, Sparkles } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import { repurpose } from "@/lib/distribution/generate";
import type { ChannelPerf, SourceArticle } from "@/lib/distribution/sample";
import { channelToPlatform } from "@/lib/distribution/handoff";
import {
  distributionPublishEvent,
  NEWSLETTER_CHANNEL,
  type DistributionAction,
} from "@/lib/distribution/publish";
import { reportAssetPublished } from "@/lib/activity/publish-client";
import { campaignSlug, channelUtmSource } from "@/lib/distribution/utm";
import {
  checkSubject,
  NEWSLETTER_SUBJECT_MAX,
  newsletterHtml,
  newsletterPlainText,
  splitNewsletter,
} from "@/lib/distribution/newsletter";
import { rollupLearnings, type DimensionLeader } from "@/lib/distribution/learnings";
import {
  advanceStatus,
  applyStoredVariants,
  selectSource,
  sourceChoices,
  storedSources,
  variantsForArticle,
  type StoredVariant,
  type VariantState,
  type VariantStatus,
} from "@/lib/distribution/variants";
import { loadVariantsAction, saveVariantAction } from "./distribution-actions";
import Sparkline from "@/components/charts/Sparkline";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social/types";
import { useProject } from "@/lib/projects/context";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import { useAiTool } from "@/components/ai/useAiTool";
import { RefineBar } from "@/components/ai/primitives";
import type { RepurposeResult, Tone } from "@/lib/ai-types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

/** Tone used for the AI repurposing — friendly/human matches the demo content. */
const REPURPOSE_TONE: Tone = "pratelsky";

const T = {
  cs: {
    sourceArticle: "Zdrojový článek",
    attributionTitle: "Atribuce podle kanálu",
    attributionDescPre: "Ukázková data — řádky odpovídají hodnotám ",
    attributionDescPost: " z odkazů výše.",
    bestClicks: "Nejvíc prokliků: {n}",
    colChannel: "Kanál",
    colReach: "Dosah",
    colClicks: "Prokliky",
    colShare: "Podíl",
    attributionEmpty: "Zatím žádná data atribuce — připojte analytiku a řádky se doplní.",
    nextStepLabel: "Naplánovat publikaci",
    nextStepHint: "Vydat varianty v centru sociálních sítí",
    // VariantCard
    aiPill: "AI",
    generateBtn: "Generuji…",
    regenerateBtn: "Vygenerovat znovu",
    rephraseBtn: "Vygenerovat AI variantu",
    variantAriaLabel: "Text varianty pro {channel}",
    trimBtn: "Zkrátit na {max} znaků",
    generatingMsg: "Generuji variantu na míru kanálu… mezitím vidíte deterministický návrh.",
    timedOut: "Model neodpověděl včas — ponecháváme deterministický návrh.",
    errorMsg: "Generování selhalo{detail}. Ponecháváme deterministický návrh.",
    retryBtn: "Zkusit znovu",
    demoMode: "Ukázkový režim (bez API klíče) — připojte LLM pro generování modelem.",
    utmLabel: "Odkaz s UTM",
    copyLinkAriaLabel: "Kopírovat odkaz s UTM pro {channel}",
    linkCopied: "Zkopírováno",
    linkBtn: "Odkaz",
    copied: "Zkopírováno",
    copyBtn: "Kopírovat",
    statusEdited: "Upraveno",
    statusGenerated: "Uloženo",
    statusHandedOff: "Předáno",
    savedHint: "Uložené varianty tohoto článku se načetly — pokračujete tam, kde jste skončili.",
    originSample: "Ukázkový článek",
    originProject: "Váš článek",
    sourcePickerLabel: "Článek",
    sampleSourceHint: "Toto je ukázkový článek. Vlastní článek sem pošlete tlačítkem „Poslat do Distribuce“ u konceptu článku.",
    scheduleBtn: "Naplánovat na {platform}",
    schedulingBtn: "Předávám…",
    scheduleError: "Předání do sociálních sítí se nezdařilo.",
    connectError: "Nepodařilo se spojit se serverem.",
    // NewsletterHandoff
    newsletterHandoff: "Předání do newsletteru",
    subjectLabel: "Předmět {n}/{max}",
    noSubject: "Bez předmětu",
    subjectEmpty: "Doplňte předmět – první řádek by měl začínat „Předmět:“.",
    subjectTooLong: "Předmět je delší než {max} znaků – v doručené poště se může oříznout.",
    copyNewsletter: "Kopírovat pro newsletter",
    downloadHtml: "Stáhnout HTML",
    // LearningsPanel
    learningsTitle: "Poznatky",
    learningsDesc: "Co podle ukázkového vzorku nejvíc korelovalo s prokliky (CTR).",
    avgCtr: "Průměrné CTR {n}",
    bestChannel: "Nejlepší kanál",
    bestFormat: "Nejlepší formát",
    bestLength: "Nejlepší délka",
    variantSingular: "varianta",
    variantFew: "varianty",
    variantMany: "variant",
    ctrByChannel: "CTR podle kanálu",
    bestVariantLabel: "Nejlepší varianta:",
    sparkAriaLabel: "CTR podle kanálu: {items}. Nejvyšší: {peak}.",
  },
  en: {
    sourceArticle: "Source article",
    attributionTitle: "Attribution by channel",
    attributionDescPre: "Sample data — rows correspond to the ",
    attributionDescPost: " values from the links above.",
    bestClicks: "Most clicks: {n}",
    colChannel: "Channel",
    colReach: "Reach",
    colClicks: "Clicks",
    colShare: "Share",
    attributionEmpty: "No attribution data yet — connect analytics and rows will fill in.",
    nextStepLabel: "Schedule publication",
    nextStepHint: "Publish the variants in the social center",
    // VariantCard
    aiPill: "AI",
    generateBtn: "Generating…",
    regenerateBtn: "Regenerate",
    rephraseBtn: "Generate AI variant",
    variantAriaLabel: "Variant text for {channel}",
    trimBtn: "Trim to {max} characters",
    generatingMsg: "Generating a channel-native variant… the deterministic draft stays on screen in the meantime.",
    timedOut: "The model did not respond in time — keeping the deterministic draft.",
    errorMsg: "Generation failed{detail}. Keeping the deterministic draft.",
    retryBtn: "Retry",
    demoMode: "Demo mode (no API key) — connect an LLM for model-generated variants.",
    utmLabel: "UTM link",
    copyLinkAriaLabel: "Copy UTM link for {channel}",
    linkCopied: "Copied",
    linkBtn: "Link",
    copied: "Copied",
    copyBtn: "Copy",
    statusEdited: "Edited",
    statusGenerated: "Saved",
    statusHandedOff: "Handed off",
    savedHint: "Loaded this article's saved variants — you're picking up where you left off.",
    originSample: "Sample article",
    originProject: "Your article",
    sourcePickerLabel: "Article",
    sampleSourceHint: "This is the sample article. Send one of your own with “Send to Distribution” on an article draft.",
    scheduleBtn: "Schedule on {platform}",
    schedulingBtn: "Sending…",
    scheduleError: "Failed to hand off to social networks.",
    connectError: "Could not reach the server.",
    // NewsletterHandoff
    newsletterHandoff: "Newsletter handoff",
    subjectLabel: "Subject {n}/{max}",
    noSubject: "No subject",
    subjectEmpty: "Add a subject — the first line should start with “Subject:”.",
    subjectTooLong: "Subject is longer than {max} characters — it may be clipped in the inbox.",
    copyNewsletter: "Copy for newsletter",
    downloadHtml: "Download HTML",
    // LearningsPanel
    learningsTitle: "Insights",
    learningsDesc: "What correlated most with clicks (CTR) in the sample data.",
    avgCtr: "Average CTR {n}",
    bestChannel: "Best channel",
    bestFormat: "Best format",
    bestLength: "Best length",
    variantSingular: "variant",
    variantFew: "variants",
    variantMany: "variants",
    ctrByChannel: "CTR by channel",
    bestVariantLabel: "Best variant:",
    sparkAriaLabel: "CTR by channel: {items}. Peak: {peak}.",
  },
} as const;

type TKey = keyof typeof T.en;
type TFn = (key: TKey, vars?: Record<string, string | number>) => string;

/** Record one Distribuce action in the shared asset-publish audit trail — the
 *  same taxonomy the AI panels use, so the publish rate counts this context too.
 *  Actions the server already records (the social handoff) map to no event and
 *  are silently skipped here; see lib/distribution/publish.ts. Fire-and-forget by
 *  contract: the copy/download must never fail because the audit write did. */
function reportDistributionPublish(
  action: DistributionAction,
  channel: string,
  projectId?: string | null
): void {
  const event = distributionPublishEvent(action, channel);
  if (event) reportAssetPublished(event.kind, event.via, projectId);
}

/** The status label for a stored variant — only rendered once the variant has a
 *  persisted record, so a fresh project shows no badge at all. */
const STATUS_LABEL: Record<VariantStatus, TKey> = {
  generated: "statusGenerated",
  edited: "statusEdited",
  handed_off: "statusHandedOff",
};

export default function DistributionModule({
  source,
  attribution,
}: {
  source: SourceArticle;
  attribution: ChannelPerf[];
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const project = useProject();

  // --- the stored record (handed-over articles + their variants) -----------
  // Loaded ONCE per project, after first paint. The deterministic fixture is
  // always what renders first (it is pure and needs no I/O); everything stored is
  // layered on top when it arrives, so a project with nothing stored renders
  // exactly what it rendered before this store existed.
  const [state, setState] = useState<VariantState | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadVariantsAction(project.id)
      .then((loaded) => {
        if (alive) setState(loaded);
      })
      .catch(() => {
        /* a hydration failure must never break the module — the deterministic
           draft is already on screen and stays usable. */
      });
    return () => {
      alive = false;
    };
  }, [project.id]);

  // --- which article are we distributing? ----------------------------------
  // With nothing handed over this ALWAYS resolves to the fixture: the fixture is
  // the empty state, not a fallback competing with real articles.
  const sources = useMemo(() => storedSources(state), [state]);
  const active = useMemo(() => selectSource(source, sources, selectedKey), [source, sources, selectedKey]);
  const activeSource = active.source;
  const key = active.key;
  const choices = useMemo(() => sourceChoices(source, sources), [source, sources]);

  const variants = useMemo(() => repurpose(activeSource), [activeSource]);
  const stored = useMemo(() => variantsForArticle(state, key), [state, key]);
  const hasStored = Object.keys(stored).length > 0;
  /** Remount key for the editors: it changes when the chosen article changes, and
   *  when saved text first arrives for it. For a fresh project both halves are
   *  constant, so nothing ever remounts — that path stays byte-identical. */
  const editorEpoch = `${key}:${hasStored ? (state?.updatedAt ?? "") : ""}`;

  /** The action returns the whole persisted blob — adopt it wholesale so the
   *  badges and any later remount agree with what the server now holds. */
  const onPersisted = useCallback((next: VariantState) => setState(next), []);

  // Stored text wins per channel; link, budget and order always come from the
  // fresh repurpose, so a saved variant can never resurrect a stale UTM link.
  const shown = useMemo(() => applyStoredVariants(variants, stored), [variants, stored]);
  const totalClicks = attribution.reduce((a, c) => a + c.clicks, 0);
  // `attribution` may be empty (a project with no channel data yet — the type permits
  // it). Guard the reduce seed + downstream `.channel` access so the module renders a
  // graceful empty state instead of unmounting with a client error.
  const best = attribution.length > 0 ? attribution.reduce((a, b) => (b.clicks > a.clicks ? b : a)) : null;

  return (
    <div className="stagger space-y-6">
      {/* source — the fixture and the user's own article must never look alike, so
          the origin is stated on the card rather than implied by the title. */}
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-accent">
          <Document width={22} height={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("sourceArticle")}
            <Pill tone={active.origin === "project" ? "positive" : "coral"}>
              {t(active.origin === "project" ? "originProject" : "originSample")}
            </Pill>
          </p>
          <p className="truncate text-base font-semibold text-navy-800">{activeSource.title}</p>
          <a href={activeSource.url} target="_blank" rel="noopener noreferrer" className="link-inline text-sm">
            {activeSource.url.replace("https://", "")}
          </a>
          {active.origin === "sample" && sources.length === 0 ? (
            <p className="mt-1 text-xs text-muted">{t("sampleSourceHint")}</p>
          ) : null}
        </div>
        {/* The picker only exists once the user has actually handed an article
            over — a brand-new project sees the card exactly as before. */}
        {sources.length > 0 ? (
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
            <span className="font-medium">{t("sourcePickerLabel")}</span>
            <select
              value={key}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="max-w-[16rem] truncate rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-navy-700 outline-none transition focus:border-brand-400 focus:bg-surface"
            >
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.origin === "sample" ? `${t("originSample")} — ${c.title}` : c.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {hasStored && (
        <p className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          <Check width={14} height={14} className="shrink-0" />
          {t("savedHint")}
        </p>
      )}

      {/* repurposed variants */}
      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((v) => (
          <VariantCard
            // Remounts the editor when the chosen article changes or its saved
            // text first arrives; constant for a project with nothing stored.
            key={`${v.channel}:${editorEpoch}`}
            channel={v.channel}
            initialText={v.text}
            max={v.max}
            link={v.link}
            source={activeSource}
            articleKey={key}
            projectId={project.id}
            storedStatus={stored[v.channel]?.status ?? null}
            onPersisted={onPersisted}
            t={t}
          />
        ))}
      </div>

      {/* attribution */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-navy-800">{t("attributionTitle")}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {t("attributionDescPre")}
              <code className="font-mono text-[0.7rem] text-navy-700">utm_source</code>
              {t("attributionDescPost")}
            </p>
          </div>
          {best && <Pill tone="positive">{t("bestClicks", { n: best.channel })}</Pill>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("colChannel")}</th>
                <th className="px-4 py-3 font-medium">utm_source</th>
                <th className="px-4 py-3 text-right font-medium">{t("colReach")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colClicks")}</th>
                <th className="px-4 py-3 text-right font-medium">CTR</th>
                <th className="px-4 py-3 text-right font-medium">{t("colShare")}</th>
              </tr>
            </thead>
            <tbody>
              {attribution.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted">
                    {t("attributionEmpty")}
                  </td>
                </tr>
              )}
              {attribution.map((c) => (
                <tr key={c.channel} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{c.channel}</td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-xs text-navy-600">{channelUtmSource(c.channel)}</code>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(c.reach)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(c.clicks)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtPct(c.reach > 0 ? c.clicks / c.reach : 0)}</td>
                  <td className="tnum px-4 py-3 text-right font-medium text-navy-800">
                    {fmt.fmtPct(totalClicks > 0 ? c.clicks / totalClicks : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* per-variant performance learnings */}
      <LearningsPanel attribution={attribution} variants={shown} t={t} fmt={fmt} />

      <NextSteps steps={[{ to: "socialni", label: t("nextStepLabel"), hint: t("nextStepHint") }]} />
    </div>
  );
}

// --- per-variant card --------------------------------------------------------

/** One repurposed variant: copy, inline-edit with a live counter + trim, and a
 *  per-platform handoff that pre-fills the social center. */
function VariantCard({
  channel,
  initialText,
  max,
  link,
  source,
  articleKey,
  projectId,
  storedStatus,
  onPersisted,
  t,
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
  t: TFn;
}) {
  const project = useProject();
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const { copied, copy: copyText } = useCopyFeedback();
  const { copied: linkCopied, copy: copyLinkText } = useCopyFeedback();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- persistence --------------------------------------------------------
  // Every path that changes what this card would ship writes it through here, so
  // the card survives a tab switch and a refresh. Fire-and-forget by contract: a
  // failed save must never turn a working copy/handoff into an error — the text
  // stays on screen either way, exactly as it did before the store existed.
  const [status, setStatus] = useState<VariantStatus | null>(storedStatus);
  const statusRef = useRef<VariantStatus | null>(storedStatus);
  const persist = useCallback(
    (nextText: string, event: VariantStatus, textChanged: boolean) => {
      const next = advanceStatus(statusRef.current ?? undefined, event, textChanged);
      statusRef.current = next;
      setStatus(next);
      const entry: StoredVariant = {
        channel,
        text: nextText,
        status: next,
        updatedAt: new Date().toISOString(),
      };
      void saveVariantAction(projectId, articleKey, source.title, channel, entry)
        .then((state) => {
          // Unowned project (the demo surface) → the action stores nothing and
          // returns null; don't pretend it was saved.
          if (state) onPersisted(state);
        })
        .catch(() => {
          /* best-effort */
        });
    },
    [articleKey, channel, onPersisted, projectId, source.title]
  );

  /** The last text handed to the store — the debounce below compares against it so
   *  simply opening the module never writes anything for a fresh project. */
  const savedText = useRef(initialText);

  // AI repurposing for this single channel (repurpose tool, via /api/ai). The
  // deterministic variant is the initial value + fallback; on success we swap in
  // the model's channel-native text, which still flows through the UTM link,
  // length counter, copy and push-to-social affordances below.
  const ai = useAiTool<RepurposeResult>("repurpose");
  /** The AI text already applied to the editor — applied once per arrival during
   *  render (avoids a set-state-in-effect cascade); manual edits then stick. */
  const [appliedAiText, setAppliedAiText] = useState<string | null>(null);
  const aiText =
    ai.status === "done"
      ? ai.data?.result.variants.find((v) => v.channel === channel)?.text ?? null
      : null;
  if (aiText && aiText !== appliedAiText) {
    setAppliedAiText(aiText);
    setText(aiText);
  }
  const usingAi = Boolean(aiText) && text === aiText;

  // Hand-edits are saved on a trailing debounce rather than per keystroke: one
  // write per pause instead of one per character. Text that is verbatim the model's
  // output is stored as `generated`; anything typed on top of it reads as `edited`,
  // so the badge distinguishes "the AI wrote this" from "I reworked it".
  useEffect(() => {
    if (text === savedText.current) return;
    const id = setTimeout(() => {
      savedText.current = text;
      persist(text, text === appliedAiText ? "generated" : "edited", true);
    }, 900);
    return () => clearTimeout(id);
  }, [text, appliedAiText, persist]);

  const platform = channelToPlatform(channel);
  const over = text.length > max;

  // Copying the variant / its UTM link IS the asset leaving the app — beacon both
  // after the clipboard write resolves.
  // A handoff does not change the text — it changes how far along it is. The
  // publish EVENT (the activity feed) and the variant STATUS answer different
  // questions: "what left the app and when" vs "which variant is already done the
  // next time this page opens". Both are recorded, neither duplicates the other.
  const handedOff = useCallback(() => persist(text, "handed_off", false), [persist, text]);

  const copy = () => {
    void copyText(text).then(() => {
      reportDistributionPublish("copyVariant", channel, project.id);
      handedOff();
    });
  };
  const copyLink = () => {
    void copyLinkText(link).then(() => {
      reportDistributionPublish("copyLink", channel, project.id);
      handedOff();
    });
  };

  // Trim the text down to the channel's soft budget.
  const trim = () => setText((t) => t.slice(0, max));

  // Ask the model for a fresh, channel-native variant of this article. Pass the
  // article BODY (not just the headline) so the variant repurposes the real content
  // — the tool digests + grounds on it (BM-L1-04).
  const regenerate = () => {
    if (ai.status === "loading") return;
    setAppliedAiText(null);
    ai.run({
      title: source.title,
      url: source.url,
      ...(source.body ? { body: source.body } : {}),
      channels: [channel],
      tone: REPURPOSE_TONE,
    });
  };

  const schedule = async () => {
    if (!platform || sending || text.trim().length < 2) return;
    setSending(true);
    setError(null);
    try {
      // Pre-fill a post for this platform via the social store's createPost
      // (its client surface), scheduled a few minutes out so it lands as a
      // draft-like scheduled post the user can still edit in the social center.
      // No publish beacon here on purpose: scheduling is a promise, not a
      // publish. The `social_post`/`channel` event is recorded server-side when
      // the post actually goes out (the social cron), so beaconing here would
      // count a publish that has not happened — and count it twice once it does.
      const scheduledAt = new Date(Date.now() + 30 * 60_000).toISOString();
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, content: text, scheduledAt, projectId: project.id }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? t("scheduleError"));
        return;
      }
      // The post is created — this variant is handed off, even though the publish
      // event itself is recorded server-side when it actually goes out.
      handedOff();
      router.push(`/app/${project.id}/socialni`);
    } catch {
      setError(t("connectError"));
    } finally {
      setSending(false);
    }
  };

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
          {/* Only a variant with a PERSISTED record carries a badge, so a fresh
              project's card is unchanged. */}
          {status ? (
            <Pill tone={status === "handed_off" ? "brand" : "neutral"}>{t(STATUS_LABEL[status])}</Pill>
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
          onClick={trim}
          className="mt-2 self-start text-xs font-semibold text-negative hover:underline"
        >
          {t("trimBtn", { max })}
        </button>
      )}

      {/* AI generation status — loading / error / demo (keyless) mode. The text
          itself (AI or deterministic) flows through the affordances below. */}
      {ai.status === "loading" ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          <Sparkles width={14} height={14} className="shrink-0 animate-pulse" />
          {t("generatingMsg")}
        </p>
      ) : null}
      {ai.status === "error" ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-xs">
          <span className="text-negative">
            {ai.timedOut
              ? t("timedOut")
              : t("errorMsg", { detail: ai.error ? `: ${ai.error}` : "" })}
          </span>
          <button
            type="button"
            onClick={regenerate}
            className="shrink-0 rounded-pill border border-line bg-surface px-2.5 py-1 font-medium text-navy-700 hover:border-brand-300"
          >
            {t("retryBtn")}
          </button>
        </div>
      ) : null}
      {usingAi && ai.data?.meta.demo ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg border border-coral-soft bg-coral-soft px-3 py-2 text-xs text-coral-600">
          <Info width={14} height={14} className="shrink-0" />
          {t("demoMode")}
        </p>
      ) : null}
      {/* Iterate on the AI variant with a steering note — same article, same
          channel, plus the user's instruction (server-side `refine`). */}
      {usingAi && ai.canRefine ? (
        <div className="mt-2">
          <RefineBar onRefine={ai.refine} disabled={ai.status !== "done"} />
        </div>
      ) : null}

      {/* The exact UTM-stamped link shipped in this variant — visible + copyable
          so attribution is verifiable, not implied. */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">{t("utmLabel")}</span>
        <code className="flex-1 truncate font-mono text-[0.7rem] text-navy-600" title={link}>
          {link.replace("https://", "")}
        </code>
        <button
          type="button"
          onClick={copyLink}
          aria-label={t("copyLinkAriaLabel", { channel })}
          className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-line bg-surface px-2 py-1 text-[0.7rem] font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
        >
          {linkCopied ? (
            <Check width={12} height={12} className="text-positive" />
          ) : (
            <Link width={12} height={12} />
          )}
          <span>{linkCopied ? t("linkCopied") : t("linkBtn")}</span>
        </button>
      </div>

      {/* Newsletter gets a dedicated handoff: the generated "Subject:" line is
          split into a real subject + body, validated separately, and exported as
          a paste-ready HTML email or copied with the UTM'd CTA. */}
      {channel === NEWSLETTER_CHANNEL ? (
        <NewsletterHandoff text={text} ctaUrl={link} source={source} onHandoff={handedOff} t={t} />
      ) : null}

      {error && <p className="mt-2 text-xs text-negative">{error}</p>}

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
            onClick={schedule}
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

// --- newsletter handoff ------------------------------------------------------

/** Newsletter channel handoff: split the variant into a subject + body, validate
 *  the subject length on its own budget, then copy a paste-ready newsletter
 *  (subject + body + UTM'd CTA) or download a self-contained HTML email. The
 *  subject + body stay derived from the (possibly AI-edited) variant text — no
 *  separate state to drift, so the AI repurpose action keeps driving this. */
function NewsletterHandoff({
  text,
  ctaUrl,
  source,
  onHandoff,
  t,
}: {
  text: string;
  ctaUrl: string;
  source: SourceArticle;
  /** advance the parent variant's persisted status — the email left the app */
  onHandoff: () => void;
  t: TFn;
}) {
  const { copied, copy } = useCopyFeedback();
  const project = useProject();
  // The email is a real deliverable that leaves the app, so its chrome (CTA,
  // subject label, <html lang>) follows the project's locale — not a baked-in cs.
  const { locale } = useLocale();

  const { subject, body } = splitNewsletter(text);
  const subjectCheck = checkSubject(subject);

  const copyNewsletter = () => {
    void copy(newsletterPlainText({ subject, body, ctaUrl, locale })).then(() => {
      reportDistributionPublish("copyNewsletter", NEWSLETTER_CHANNEL, project.id);
      onHandoff();
    });
  };

  const downloadHtml = () => {
    const html = newsletterHtml({ subject, body, ctaUrl, locale });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `newsletter-${campaignSlug(source) || "clanek"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
    reportDistributionPublish("downloadNewsletter", NEWSLETTER_CHANNEL, project.id);
    onHandoff();
  };

  const subjectHint =
    subjectCheck.status === "empty"
      ? t("subjectEmpty")
      : subjectCheck.status === "tooLong"
        ? t("subjectTooLong", { max: subjectCheck.max })
        : null;

  return (
    <div className="mt-3 rounded-lg border border-line bg-canvas px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">{t("newsletterHandoff")}</span>
        <span
          className={`tnum text-[0.7rem] ${
            subjectCheck.status === "ok" ? "text-muted" : "text-negative"
          }`}
        >
          {t("subjectLabel", { n: subjectCheck.length, max: NEWSLETTER_SUBJECT_MAX })}
        </span>
      </div>

      <p className="mt-1.5 truncate text-sm font-medium text-navy-800" title={subject || undefined}>
        {subject || <span className="italic text-muted">{t("noSubject")}</span>}
      </p>

      {subjectHint ? (
        <p className="mt-1 flex items-center gap-1.5 text-[0.7rem] text-negative">
          <Info width={12} height={12} className="shrink-0" />
          {subjectHint}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyNewsletter}
          disabled={!subjectCheck.valid || body.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? <Check width={14} height={14} className="text-positive" /> : <Copy width={14} height={14} />}
          <span>{copied ? t("copied") : t("copyNewsletter")}</span>
        </button>
        <button
          type="button"
          onClick={downloadHtml}
          disabled={!subjectCheck.valid || body.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download width={14} height={14} />
          <span>{t("downloadHtml")}</span>
        </button>
      </div>
    </div>
  );
}

// --- performance learnings ---------------------------------------------------

const SPARK_W = 120;
const SPARK_H = 28;

/** Per-channel CTR sparkline over the shared chart primitive — `markPeak` puts
 *  the dot on the BEST channel (not the last point), which is the semantic the
 *  hand-rolled version existed for. */
function CtrSparkline({ ctrs, labels, t, fmt }: { ctrs: number[]; labels: string[]; t: TFn; fmt: ReturnType<typeof useFormatters> }) {
  if (ctrs.length < 2) return null;
  const peakIndex = ctrs.reduce((best, v, i) => (v > ctrs[best]! ? i : best), 0);
  const items = labels.map((l, i) => `${l} ${fmt.fmtPct(ctrs[i] ?? 0)}`).join(", ");
  return (
    <Sparkline
      values={ctrs}
      width={SPARK_W}
      height={SPARK_H}
      area={false}
      stroke="var(--color-brand-accent)"
      strokeWidth={1.75}
      markPeak
      className="overflow-visible"
      label={t("sparkAriaLabel", { items, peak: labels[peakIndex] ?? "" })}
    />
  );
}

/** "Insights" — a descriptive rollup over the attribution sample: the best
 *  channel / format / length by reach-weighted CTR, plus a per-channel CTR
 *  sparkline. Start descriptive (no new backend) — the seam is real per-variant
 *  click analytics replacing the sample. */
function LearningsPanel({
  attribution,
  variants,
  t,
  fmt,
}: {
  attribution: ChannelPerf[];
  variants: { channel: string; text: string }[];
  t: TFn;
  fmt: ReturnType<typeof useFormatters>;
}) {
  const learnings = useMemo(() => {
    const lengthByChannel = new Map(variants.map((v) => [v.channel, v.text.length] as const));
    return rollupLearnings(attribution, (channel) => lengthByChannel.get(channel) ?? 0);
  }, [attribution, variants]);

  if (learnings.rows.length === 0) return null;

  const leaders: { label: string; leader: DimensionLeader | null }[] = [
    { label: t("bestChannel"), leader: learnings.bestChannel },
    { label: t("bestFormat"), leader: learnings.bestFormat },
    { label: t("bestLength"), leader: learnings.bestLength },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-accent">
            <Bulb width={16} height={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-navy-800">{t("learningsTitle")}</h3>
            <p className="mt-0.5 text-xs text-muted">{t("learningsDesc")}</p>
          </div>
        </div>
        <Pill tone="positive">{t("avgCtr", { n: fmt.fmtPct(learnings.overallCtr) })}</Pill>
      </div>

      <div className="grid gap-px bg-line sm:grid-cols-3">
        {leaders.map(({ label, leader }) => (
          <div key={label} className="bg-surface px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
            {leader ? (
              <>
                <p className="mt-1 text-sm font-semibold text-navy-800">{leader.value}</p>
                <p className="tnum mt-0.5 text-xs text-muted">
                  CTR {fmt.fmtPct(leader.ctr)} · {leader.variants}{" "}
                  {leader.variants === 1
                    ? t("variantSingular")
                    : leader.variants < 5
                      ? t("variantFew")
                      : t("variantMany")}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">—</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("ctrByChannel")}</p>
          <p className="mt-1 text-sm text-navy-700">
            {t("bestVariantLabel")}{" "}
            <span className="font-semibold text-navy-800">{learnings.bestVariant?.channel}</span>{" "}
            <span className="tnum text-muted">({fmt.fmtPct(learnings.bestVariant?.ctr ?? 0)})</span>
          </p>
        </div>
        <CtrSparkline
          ctrs={learnings.rows.map((r) => r.ctr)}
          labels={learnings.rows.map((r) => r.channel)}
          t={t}
          fmt={fmt}
        />
      </div>
    </div>
  );
}
