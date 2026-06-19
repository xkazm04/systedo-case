"use client";

/** Week planner — Sofie's "plan a week of social in one go" surface. A 7-day
 *  calendar of scheduled posts, plus a batch generator: give a few topics (one per
 *  line) + a platform, and it drafts each with the AI social tool (reusing
 *  /api/social/draft) and schedules them across consecutive days as `scheduled`
 *  posts (POST /api/social/posts). No new backend — it orchestrates the existing
 *  draft + posts routes, then the calendar reflects them. */
import { useCallback, useEffect, useState } from "react";
import { Calendar, Clock, Sparkles } from "@/components/icons";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  TONES,
  TONE_LABELS,
  type SocialPlatform,
  type SocialPost,
  type Tone,
} from "@/lib/social/types";

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
 *  SSR/client hydration mismatch on the date). */
function buildWeek(): Day[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = d.getDay();
    return {
      iso: localIso(d),
      label: d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" }),
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
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [week, setWeek] = useState<Day[]>([]);

  const [topics, setTopics] = useState("");
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [tone, setTone] = useState<Tone>("pratelsky");
  const [hour, setHour] = useState("10");
  const [brand] = useState(readSocialBrand);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/social/posts");
      const json = (await res.json()) as { posts?: SocialPost[] };
      setPosts(json.posts ?? []);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeek(buildWeek());
    void loadPosts();
    const handler = () => void loadPosts();
    window.addEventListener("social:posts-changed", handler);
    return () => window.removeEventListener("social:posts-changed", handler);
  }, [loadPosts]);

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
            platforms: [platform],
            ai: true,
            brand: brand.trim() || undefined,
          }),
        });
        const draftJson = await draftRes.json();
        if (!draftRes.ok) {
          setError(draftJson?.error ?? "Generování se nezdařilo.");
          break;
        }
        const drafts: { platform: SocialPlatform; content: string }[] = draftJson.drafts ?? [];
        const post = drafts.find((d) => d.platform === platform) ?? drafts[0];
        if (post?.content) {
          const when = new Date(first);
          when.setDate(first.getDate() + i);
          await fetch("/api/social/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ platform, content: post.content, scheduledAt: when.toISOString() }),
          });
        }
        setProgress({ done: i + 1, total: topicLines.length });
      } catch {
        setError("Nepodařilo se spojit se serverem.");
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
        <h2 className="text-base font-semibold text-navy-800">Plán týdne</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        Zadejte témata (jedno na řádek), AI z nich napíše příspěvky a rozloží je na následující dny.
      </p>

      {/* batch generator */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
        <div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Témata (jedno na řádek)</span>
            <textarea
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              rows={4}
              placeholder={"Nová zimní směs ořechů\nTip: ořechy do ranní kaše\nPříběh značky — odkud vozíme kešu\nRecept: domácí müsli"}
              className="w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </label>
          <p className="mt-1 text-xs text-muted">
            {topicLines.length}/7 témat · vznikne {topicLines.length || "0"}{" "}
            {topicLines.length === 1 ? "naplánovaný příspěvek" : "naplánovaných příspěvků"}
          </p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-navy-700">Platforma</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
              className="w-full rounded-lg border border-line bg-canvas px-2.5 py-2 text-sm outline-none focus:border-brand-400"
            >
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {SOCIAL_PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-navy-700">Tón</span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
                className="w-full rounded-lg border border-line bg-canvas px-2 py-2 text-sm outline-none focus:border-brand-400"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-navy-700">Čas</span>
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
            {running && progress ? `Generuji… ${progress.done}/${progress.total}` : "Naplánovat týden"}
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
                            {new Date(p.scheduledAt).toLocaleTimeString("cs-CZ", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
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
