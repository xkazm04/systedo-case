"use client";

import { useEffect, useState } from "react";
import { Bolt, Check, Sparkles } from "@/components/icons";
import { useOptionalProject } from "@/lib/projects/context";
import { useT } from "@/lib/i18n/client";
import {
  PLATFORM_LIMITS,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  TONES,
  TONE_LABELS,
  type SocialPlatform,
  type Tone,
} from "@/lib/social/types";

const T = {
  cs: {
    newPost: "Nový příspěvek",
    topic: "Téma",
    topicPlaceholder: "Např. nová sezónní směs ořechů",
    tone: "Tón",
    brandVoice: "Hlas značky (volitelné)",
    brandPlaceholder: "Co prodáváte + jak mluvíte — např. Mionelo: ořechy a superpotraviny, přátelsky a autenticky",
    brandHint: "AI píše v hlase vaší značky, ne genericky.",
    brandAuto: "Píše na značku podle katalogu:",
    draftPlatforms: "Platformy pro návrh",
    templateBtn: "Šablona",
    drafting: "Navrhuji…",
    aiBtn: "Navrhnout s AI",
    aiWriting: "AI píše…",
    aiDraft: "AI návrh",
    demoSource: "Ukázkový režim",
    templateSource: "Šablona",
    useBtn: "Použít",
    postToPublish: "Příspěvek k publikaci",
    postPlaceholder: "Napište příspěvek nebo použijte návrh výše…",
    scheduleLabel: "Naplánovat na (volitelné)",
    saving: "Ukládám…",
    schedule: "Naplánovat",
    publishNow: "Zveřejnit teď",
    draftFailed: "Draft failed.",
    serverError: "Could not reach the server.",
    saveFailed: "Save failed.",
  },
  en: {
    newPost: "New post",
    topic: "Topic",
    topicPlaceholder: "e.g. new seasonal nut blend",
    tone: "Tone",
    brandVoice: "Brand voice (optional)",
    brandPlaceholder: "What you sell + how you talk — e.g. Mionelo: nuts & superfoods, friendly and authentic",
    brandHint: "AI writes in your brand voice, not generically.",
    brandAuto: "Writing on-brand from your catalogue:",
    draftPlatforms: "Platforms to draft for",
    templateBtn: "Template",
    drafting: "Drafting…",
    aiBtn: "Draft with AI",
    aiWriting: "AI writing…",
    aiDraft: "AI draft",
    demoSource: "Demo mode",
    templateSource: "Template",
    useBtn: "Use",
    postToPublish: "Post to publish",
    postPlaceholder: "Write a post or use a draft above…",
    scheduleLabel: "Schedule for (optional)",
    saving: "Saving…",
    schedule: "Schedule",
    publishNow: "Publish now",
    draftFailed: "Draft failed.",
    serverError: "Could not reach the server.",
    saveFailed: "Save failed.",
  },
} as const;

export default function Composer() {
  const project = useOptionalProject();
  const pid = project?.id;
  const t = useT(T);
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("pratelsky");
  const [draftPlatforms, setDraftPlatforms] = useState<Set<SocialPlatform>>(new Set(["instagram", "facebook"]));
  const [drafts, setDrafts] = useState<{ platform: SocialPlatform; content: string }[]>([]);
  const [drafting, setDrafting] = useState<false | "template" | "ai">(false);
  const [draftSource, setDraftSource] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  // Brand voice (what they sell + how they talk) — de-hardcodes the assistant from a
  // single brand; persisted locally so it sticks, and fed to the AI draft as `brand`.
  const [brand, setBrand] = useState("");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("app:social-brand");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setBrand(saved);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("app:social-brand", brand);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [brand]);
  // C1 unify: the project's auto-derived catalogue voice — used by the server when
  // this field is blank, so show it here too (parity with the WeekPlanner strip).
  const [autoBrand, setAutoBrand] = useState("");
  useEffect(() => {
    if (!pid) return;
    let live = true;
    fetch(`/api/projects/${encodeURIComponent(pid)}/brand-context`)
      .then((r) => (r.ok ? r.json() : { context: "" }))
      .then((j: { context?: string }) => {
        if (live) setAutoBrand(j.context ?? "");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pid]);

  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [content, setContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDraftPlatform = (p: SocialPlatform) =>
    setDraftPlatforms((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const suggest = async (ai: boolean) => {
    if (topic.trim().length < 2 || draftPlatforms.size === 0) return;
    setDrafting(ai ? "ai" : "template");
    setDraftError(null);
    try {
      const res = await fetch("/api/social/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          tone,
          platforms: [...draftPlatforms],
          ai,
          brand: brand.trim() || undefined,
          // R03: carry the project so the server can apply the auto-brand / perf /
          // competitor grounding the "Píše na značku" hint advertises (Composer↔WeekPlanner parity).
          projectId: pid,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDraftError(json?.error ?? t("draftFailed"));
        return;
      }
      setDrafts(json.drafts ?? []);
      setDraftSource(json.source ?? null);
    } catch {
      setDraftError(t("serverError"));
    } finally {
      setDrafting(false);
    }
  };

  const use = (d: { platform: SocialPlatform; content: string }) => {
    setPlatform(d.platform);
    setContent(d.content);
  };

  const submit = async () => {
    if (content.trim().length < 2) return;
    setPosting(true);
    setError(null);
    try {
      // The <input type="datetime-local"> value is a timezone-NAIVE local wall-clock
      // string; convert it to a UTC ISO instant HERE (the browser knows the user's
      // offset — the server does not) so the stored value and the cron's UTC "due"
      // comparison agree. Matches WeekPlanner, which already sends toISOString().
      const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, content, scheduledAt: scheduledIso, projectId: pid }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? t("saveFailed"));
        return;
      }
      setContent("");
      setScheduledAt("");
      window.dispatchEvent(new CustomEvent("social:posts-changed"));
    } finally {
      setPosting(false);
    }
  };

  const over = content.length > PLATFORM_LIMITS[platform];

  return (
    <div className="card space-y-5 p-6 lg:sticky lg:top-24">
      <h2 className="text-base font-semibold text-navy-800">{t("newPost")}</h2>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("topic")}</span>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t("topicPlaceholder")}
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("tone")}</span>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          >
            {TONES.map((tn) => (
              <option key={tn} value={tn}>
                {TONE_LABELS[tn]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("brandVoice")}</span>
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder={t("brandPlaceholder")}
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
        />
        {!brand.trim() && autoBrand ? (
          <span className="mt-1 flex items-start gap-1 text-xs text-positive">
            <Check width={13} height={13} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">{t("brandAuto")}</span> {autoBrand}
            </span>
          </span>
        ) : (
          <span className="mt-1 block text-xs text-muted">{t("brandHint")}</span>
        )}
      </label>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("draftPlatforms")}</span>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggleDraftPlatform(p)}
              className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
                draftPlatforms.has(p) ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line text-muted hover:border-navy-200"
              }`}
            >
              {SOCIAL_PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => suggest(false)}
          disabled={Boolean(drafting) || topic.trim().length < 2 || draftPlatforms.size === 0}
          className="inline-flex items-center justify-center gap-2 rounded-pill border border-line px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
        >
          <Bolt width={15} height={15} />
          {drafting === "template" ? t("drafting") : t("templateBtn")}
        </button>
        <button
          type="button"
          onClick={() => suggest(true)}
          disabled={Boolean(drafting) || topic.trim().length < 2 || draftPlatforms.size === 0}
          className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          <Sparkles width={15} height={15} />
          {drafting === "ai" ? t("aiWriting") : t("aiBtn")}
        </button>
      </div>

      {draftError && <p className="text-sm text-negative">{draftError}</p>}

      {drafts.length > 0 && (
        <div className="space-y-2">
          {draftSource && (
            <span
              className={`pill ${
                draftSource === "ai"
                  ? "bg-positive-soft text-positive"
                  : draftSource === "demo"
                    ? "bg-coral-soft text-coral-600"
                    : "bg-navy-50 text-muted"
              }`}
            >
              {draftSource === "ai" ? t("aiDraft") : draftSource === "demo" ? t("demoSource") : t("templateSource")}
            </span>
          )}
          {drafts.map((d) => (
            <div key={d.platform} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-navy-700">{SOCIAL_PLATFORM_LABELS[d.platform]}</span>
                <button type="button" onClick={() => use(d)} className="text-xs font-semibold text-brand-accent hover:text-brand-800">
                  {t("useBtn")}
                </button>
              </div>
              <p className="mt-1 whitespace-pre-line text-xs text-muted">{d.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-line pt-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-navy-700">{t("postToPublish")}</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
            className="rounded-lg border border-line bg-canvas px-2 py-1 text-xs outline-none focus:border-brand-400"
          >
            {SOCIAL_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {SOCIAL_PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder={t("postPlaceholder")}
          className="mt-2 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className={`tnum ${over ? "text-negative" : "text-muted"}`}>
            {content.length}/{PLATFORM_LIMITS[platform]}
          </span>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("scheduleLabel")}</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          />
        </label>

        {error && <p className="mt-2 text-sm text-negative">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={posting || content.trim().length < 2 || over}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {posting ? t("saving") : scheduledAt ? t("schedule") : t("publishNow")}
        </button>
      </div>
    </div>
  );
}
