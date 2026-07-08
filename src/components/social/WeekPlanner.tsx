"use client";

/** Week planner — Sofie's "plan a week of social in one go" surface. A 7-day
 *  calendar of scheduled posts, plus a batch generator: give a few topics (one per
 *  line) + a platform, and it drafts each with the AI social tool (reusing
 *  /api/social/draft) and schedules them across consecutive days as `scheduled`
 *  posts (POST /api/social/posts). No new backend — it orchestrates the existing
 *  draft + posts routes, then the calendar reflects them. */
import { useCallback, useEffect, useState } from "react";
import { Calendar, Check, Clock, Sparkles } from "@/components/icons";
import { useOptionalProject } from "@/lib/projects/context";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { Formatters } from "@/lib/format";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  TONES,
  TONE_LABELS,
  type SocialPlatform,
  type SocialPost,
  type Tone,
} from "@/lib/social/types";

const T = {
  cs: {
    title: "Plán týdne",
    subtitle: "Zadejte témata (jedno na řádek), AI z nich napíše příspěvky a rozloží je na následující dny.",
    topicsLabel: "Témata (jedno na řádek)",
    topicsPlaceholder: "Nová zimní směs ořechů\nTip: ořechy do ranní kaše\nPříběh značky — odkud vozíme kešu\nRecept: domácí müsli",
    topicCount: "{n}/7 témat · vznikne {n} naplánovaný příspěvek",
    topicCountPlural: "{n}/7 témat · vznikne {n} naplánovaných příspěvků",
    topicCountZero: "0/7 témat · vznikne 0 naplánovaných příspěvků",
    batchSummary: "{topics}/7 témat × {plats} sítě = {posts} příspěvků v jednom běhu (na síť jiná verze)",
    platformLabel: "Platforma",
    toneLabel: "Tón",
    timeLabel: "Čas",
    planBtn: "Naplánovat týden",
    generating: "Generuji… {done}/{total}",
    genFailed: "Generování se nezdařilo.",
    serverError: "Nepodařilo se spojit se serverem.",
    voiceLabel: "Píše na značku",
    voiceHint: "Odvozeno z vašeho katalogu — příspěvky drží váš sortiment a slovník. Upravit v Katalogu.",
  },
  en: {
    title: "Week plan",
    subtitle: "Enter topics (one per line) and AI will write posts and spread them across the coming days.",
    topicsLabel: "Topics (one per line)",
    topicsPlaceholder: "New winter nut blend\nTip: nuts in morning porridge\nBrand story — where we source cashews\nRecipe: homemade granola",
    topicCount: "{n}/7 topics · will create {n} scheduled post",
    topicCountPlural: "{n}/7 topics · will create {n} scheduled posts",
    topicCountZero: "0/7 topics · will create 0 scheduled posts",
    batchSummary: "{topics}/7 topics × {plats} networks = {posts} posts in one run (a distinct version per network)",
    platformLabel: "Platform",
    toneLabel: "Tone",
    timeLabel: "Time",
    planBtn: "Plan the week",
    generating: "Generating… {done}/{total}",
    genFailed: "Generation failed.",
    serverError: "Could not reach the server.",
    voiceLabel: "Writing on-brand",
    voiceHint: "Derived from your catalogue — posts stay in your range and vocabulary. Edit in Catalog.",
  },
} as const;

interface Day {
  iso: string;
  label: string;
  weekend: boolean;
}

/** YYYY-MM-DD in LOCAL time, so a post's day matches the calendar cell it shows
 *  under — toISOString() would shift the date across the UTC boundary near midnight
 *  (a local-midnight date becomes the previous UTC day). */
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Build the next 7 days from today (computed in an effect, not render, to avoid an
 *  SSR/client hydration mismatch on the date). Labels come from the shared
 *  locale-bound formatters instead of re-deriving the BCP-47 tag here. */
function buildWeek(fmt: Formatters): Day[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = d.getDay();
    const iso = localIso(d);
    return {
      iso,
      label: fmt.fmtWeekdayShort(iso),
      weekend: dow === 0 || dow === 6,
    };
  });
}

/** Read the shared social brand voice once (SSR-guarded), so the batch is on-brand. */
function readSocialBrand(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem("app:social-brand") ?? "";
  } catch {
    return "";
  }
}

export default function WeekPlanner() {
  const project = useOptionalProject();
  const pid = project?.id;
  const t = useT(T);
  const fmt = useFormatters();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [week, setWeek] = useState<Day[]>([]);

  const [topics, setTopics] = useState("");
  // D3: fan each topic across every selected platform in ONE run, so IG/FB/TikTok
  // get differentiated captions from a single pass — no 3× rerun over shared topics.
  const [platforms, setPlatforms] = useState<Set<SocialPlatform>>(new Set(["instagram"]));
  const togglePlatform = (p: SocialPlatform) =>
    setPlatforms((s) => {
      const next = new Set(s);
      if (next.has(p)) {
        if (next.size > 1) next.delete(p); // keep at least one selected
      } else next.add(p);
      return next;
    });
  const [tone, setTone] = useState<Tone>("pratelsky");
  const [hour, setHour] = useState("10");
  const [brand] = useState(readSocialBrand);
  // C1: the project's auto-derived brand voice (what it sells + how it talks), so the
  // batch is on-brand BY DEFAULT — shown here, not buried in the Composer.
  const [autoBrand, setAutoBrand] = useState("");

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      const url = pid ? `/api/social/posts?projectId=${encodeURIComponent(pid)}` : "/api/social/posts";
      const res = await fetch(url);
      const json = (await res.json()) as { posts?: SocialPost[] };
      setPosts(json.posts ?? []);
    } catch {
      /* non-critical */
    }
  }, [pid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeek(buildWeek(fmt));
    void loadPosts();
    const handler = () => void loadPosts();
    window.addEventListener("social:posts-changed", handler);
    return () => window.removeEventListener("social:posts-changed", handler);
  }, [loadPosts, fmt]);

  // Fetch the derived brand voice for this project (empty for an empty catalogue).
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

  // Scheduled posts grouped by their day (YYYY-MM-DD), for the calendar cells.
  const byDay = new Map<string, SocialPost[]>();
  for (const p of posts) {
    if (p.status !== "scheduled" || !p.scheduledAt) continue;
    const iso = localIso(new Date(p.scheduledAt));
    const arr = byDay.get(iso);
    if (arr) arr.push(p);
    else byDay.set(iso, [p]);
  }

  const topicLines = topics
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 7);

  const topicCountLabel =
    topicLines.length === 0
      ? t("topicCountZero")
      : t("batchSummary", {
          topics: topicLines.length,
          plats: platforms.size,
          posts: topicLines.length * platforms.size,
        });

  async function planWeek() {
    if (topicLines.length === 0 || running) return;
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: topicLines.length });
    // First slot today at the chosen hour; if that's already past, start tomorrow,
    // so every scheduled post lands in the future (the store keeps future-dated ones).
    const first = new Date();
    first.setHours(Number(hour) || 10, 0, 0, 0);
    if (first.getTime() <= Date.now()) first.setDate(first.getDate() + 1);
    for (let i = 0; i < topicLines.length; i++) {
      try {
        const draftRes = await fetch("/api/social/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: topicLines[i],
            tone,
            platforms: [...platforms],
            ai: true,
            // On-brand by default (C1): a manual voice wins, else the auto-derived
            // catalogue voice, else the project name — never a placeholder company.
            // projectId grounds "what's working" and the server-side voice fallback.
            brand: brand.trim() || autoBrand || project?.name || undefined,
            ...(pid ? { projectId: pid } : {}),
          }),
        });
        const draftJson = await draftRes.json();
        if (!draftRes.ok) {
          setError(draftJson?.error ?? t("genFailed"));
          break;
        }
        // One topic → a differentiated caption per selected platform, all scheduled on
        // the topic's day (the topic runs across every channel that day).
        const drafts: { platform: SocialPlatform; content: string }[] = draftJson.drafts ?? [];
        const when = new Date(first);
        when.setDate(first.getDate() + i);
        for (const d of drafts) {
          if (!d?.content || !platforms.has(d.platform)) continue;
          await fetch("/api/social/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ platform: d.platform, content: d.content, scheduledAt: when.toISOString(), projectId: pid }),
          });
        }
        setProgress({ done: i + 1, total: topicLines.length });
      } catch {
        setError(t("serverError"));
        break;
      }
    }
    setRunning(false);
    setTopics("");
    window.dispatchEvent(new CustomEvent("social:posts-changed"));
    void loadPosts();
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2">
        <Calendar width={18} height={18} className="shrink-0 text-brand-600" />
        <h2 className="text-base font-semibold text-navy-800">{t("title")}</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        {t("subtitle")}
      </p>

      {/* C1: prove the tool knows the brand — the auto-derived catalogue voice the
          batch will use by default (a manual voice, when set, overrides it). */}
      {!brand.trim() && autoBrand && (
        <div className="mt-3 rounded-lg border border-positive/25 bg-positive-soft px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-positive">
            <Check width={14} height={14} className="shrink-0" />
            {t("voiceLabel")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-navy-700">{autoBrand}</p>
          <p className="mt-1.5 text-xs text-muted">{t("voiceHint")}</p>
        </div>
      )}

      {/* batch generator */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
        <div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("topicsLabel")}</span>
            <textarea
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              rows={4}
              placeholder={t("topicsPlaceholder")}
              className="w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </label>
          <p className="mt-1 text-xs text-muted">
            {topicCountLabel}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-navy-700">{t("platformLabel")}</span>
            <div className="flex flex-wrap gap-1.5">
              {SOCIAL_PLATFORMS.map((p) => {
                const on = platforms.has(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    aria-pressed={on}
                    className={`rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors ${
                      on ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line text-navy-700 hover:border-brand-300"
                    }`}
                  >
                    {SOCIAL_PLATFORM_LABELS[p]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-navy-700">{t("toneLabel")}</span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
                className="w-full rounded-lg border border-line bg-canvas px-2 py-2 text-sm outline-none focus:border-brand-400"
              >
                {TONES.map((tn) => (
                  <option key={tn} value={tn}>
                    {TONE_LABELS[tn]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-navy-700">{t("timeLabel")}</span>
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                className="w-full rounded-lg border border-line bg-canvas px-2 py-2 text-sm outline-none focus:border-brand-400"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={planWeek}
            disabled={running || topicLines.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles width={15} height={15} className={running ? "animate-pulse" : ""} />
            {running && progress ? t("generating", { done: progress.done, total: progress.total }) : t("planBtn")}
          </button>
          {error && <p className="text-xs text-negative">{error}</p>}
        </div>
      </div>

      {/* calendar */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {week.map((d) => {
          const dayPosts = byDay.get(d.iso) ?? [];
          return (
            <div
              key={d.iso}
              className={`rounded-lg border p-2.5 ${d.weekend ? "border-line bg-canvas" : "border-line bg-surface"}`}
            >
              <p className="text-xs font-semibold capitalize text-navy-700">{d.label}</p>
              <div className="mt-1.5 space-y-1.5">
                {dayPosts.length === 0 ? (
                  <p className="text-[11px] text-muted">—</p>
                ) : (
                  dayPosts.map((p) => (
                    <div key={p.id} className="rounded-md border border-brand-200 bg-brand-50/50 p-1.5">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                        {SOCIAL_PLATFORM_LABELS[p.platform]}
                        {p.scheduledAt && (
                          <span className="ml-auto inline-flex items-center gap-0.5 font-normal normal-case text-muted">
                            <Clock width={9} height={9} />
                            {fmt.fmtTime(p.scheduledAt)}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-navy-700">{p.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
