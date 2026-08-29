"use client";

/** Week planner — Sofie's "plan a week of social in one go" surface. A 7-day calendar of scheduled
 *  posts, plus a batch generator: give a few topics (one per line) + a platform, and it drafts each
 *  with the AI social tool (reusing /api/social/draft) and schedules them across consecutive days as
 *  `scheduled` posts (POST /api/social/posts). No new backend — it orchestrates the existing draft +
 *  posts routes, then the calendar reflects them. The batch engine (bounded concurrency, abort-on-
 *  unmount, and the weekly cadence cap's refusal + override) lives in usePlanWeek; posts and the
 *  brand voice come from the shared social data stores, so this screen no longer double-fetches
 *  what Composer/PostsList already loaded. */
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Calendar, Check, Clock, Info, Sparkles } from "@/components/icons";
import { useOptionalProject } from "@/lib/projects/context";
import DraftHealth from "./DraftHealth";
import { useSocialAccounts } from "./useSocialAccounts";
import { useBrandContext, useSocialPosts } from "./useSocialData";
import { useSocialBrand } from "./useSocialBrand";
import { usePlanWeek } from "./usePlanWeek";
import { scheduleWillNotPublish } from "@/lib/social/schedule-signal";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Formatters } from "@/lib/format";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  TONES,
  toneLabel,
  type SocialPlatform,
  type SocialPost,
  type Tone,
} from "@/lib/social/types";

const T = {
  cs: {
    title: "Plán týdne",
    subtitle: "Zadejte témata (jedno na řádek), AI z nich napíše příspěvky a rozloží je na následující dny.",
    topicsLabel: "Témata (jedno na řádek)",
    topicsPlaceholder: "Nová zimní směs ořechů\nTip: ořechy do ranní kaše\nPříběh značky: odkud vozíme kešu\nRecept: domácí müsli",
    topicCountZero: "0/7 témat · vznikne 0 naplánovaných příspěvků",
    batchSummary: "{topics}/7 témat × {plats} sítě = {posts} příspěvků v jednom běhu (na síť jiná verze)",
    platformLabel: "Platforma",
    toneLabel: "Tón",
    timeLabel: "Čas",
    planBtn: "Naplánovat týden",
    generating: "Generuji… {done}/{total}",
    overLimit: "{count} témat: naplánuje se prvních 7, zbytek zůstane v poli.",
    voiceLabel: "Píše na značku",
    voiceHint: "Odvozeno z vašeho katalogu: příspěvky drží váš sortiment a slovník. Upravit v Katalogu.",
    degradedBatch: "{n} z {total} návrhů se vrátilo s výhradou — zkontrolujte texty v kalendáři.",
    noAccountTitle: "Nic se samo nezveřejní.",
    noAccountBody: "Není připojený žádný účet, takže naplánované příspěvky zůstanou ve stavu „Naplánováno“ napořád. Připojte účet v panelu výše a publikování se rozběhne.",
  },
  en: {
    title: "Week plan",
    subtitle: "Enter topics (one per line) and AI will write posts and spread them across the coming days.",
    topicsLabel: "Topics (one per line)",
    topicsPlaceholder: "New winter nut blend\nTip: nuts in morning porridge\nBrand story: where we source cashews\nRecipe: homemade granola",
    topicCountZero: "0/7 topics · will create 0 scheduled posts",
    batchSummary: "{topics}/7 topics × {plats} networks = {posts} posts in one run (a distinct version per network)",
    platformLabel: "Platform",
    toneLabel: "Tone",
    timeLabel: "Time",
    planBtn: "Plan the week",
    generating: "Generating… {done}/{total}",
    overLimit: "{count} topics: the first 7 will be scheduled, the rest stay in the field.",
    voiceLabel: "Writing on-brand",
    voiceHint: "Derived from your catalog: posts stay in your range and vocabulary. Edit in Catalog.",
    degradedBatch: "{n} of {total} drafts came back flagged — review the texts in the calendar.",
    noAccountTitle: "Nothing will publish on its own.",
    noAccountBody: "No account is connected, so scheduled posts will stay “Scheduled” forever. Connect an account in the bar above and publishing will start.",
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

/** Parse the hour field into a valid 0–23 slot, falling back to 10. Shared by the calendar and
 *  the scheduler so both anchor to the SAME first day. */
function parseHour(hour: string): number {
  const h = Number(hour);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 10;
}

/** The first scheduling slot: today at the chosen hour, or tomorrow if that's already
 *  past (so every scheduled post lands in the future). The calendar anchors to this
 *  same date so a batch never lands outside the visible week. */
function firstSlotDate(safeHour: number): Date {
  const first = new Date();
  first.setHours(safeHour, 0, 0, 0);
  if (first.getTime() <= Date.now()) first.setDate(first.getDate() + 1);
  return first;
}

/** Build the 7 days from `start` (computed in an effect, not render, to avoid an
 *  SSR/client hydration mismatch on the date). Anchored to the scheduler's first slot
 *  — NOT always today — so when scheduling rolls to tomorrow the grid rolls with it and
 *  no post is scheduled onto an invisible day 8. Labels come from the shared
 *  locale-bound formatters instead of re-deriving the BCP-47 tag here. */
function buildWeek(fmt: Formatters, start: Date): Day[] {
  const base = new Date(start);
  base.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dow = d.getDay();
    const iso = localIso(d);
    return {
      iso,
      label: fmt.fmtWeekdayShort(iso),
      weekend: dow === 0 || dow === 6,
    };
  });
}

export default function WeekPlanner() {
  const project = useOptionalProject();
  const pid = project?.id;
  const { status: sessionStatus } = useSession();
  // Shared accounts source (one fetch with AccountsBar/PostsList): the cron only
  // publishes for connected users, so scheduling with zero accounts is a dead
  // letter — say so instead of letting posts sit "Naplánováno" forever. Anonymous
  // visitors are in the demo sandbox; the sign-in card owns that framing.
  const { status: accountsStatus, accounts } = useSocialAccounts();
  const publishBlocked =
    sessionStatus === "authenticated" &&
    scheduleWillNotPublish({ accountsReady: accountsStatus === "ready", accountCount: accounts.length });
  const t = useT(T);
  const fmt = useFormatters();
  const { locale } = useLocale();
  // Shared stores: one posts fetch (with PostsList) refetched on the
  // `social:posts-changed` bus; one brand-context fetch (with Composer); the brand
  // voice lives in the tenant store (localStorage-migrated) via useSocialBrand.
  const { posts } = useSocialPosts(pid);
  const autoBrand = useBrandContext(pid);
  const { brand } = useSocialBrand(pid);
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
  const safeHour = parseHour(hour);

  // The batch engine: bounded-concurrency drafting + saves, abort on unmount,
  // fail-fast on the first server error (rate-limit behavior unchanged).
  const { running, progress, error, batchHealth, planWeek, notice } = usePlanWeek();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeek(buildWeek(fmt, firstSlotDate(safeHour)));
  }, [fmt, safeHour]);

  // Scheduled posts grouped by their day (YYYY-MM-DD), for the calendar cells.
  const byDay = new Map<string, SocialPost[]>();
  for (const p of posts) {
    if (p.status !== "scheduled" || !p.scheduledAt) continue;
    const iso = localIso(new Date(p.scheduledAt));
    const arr = byDay.get(iso);
    if (arr) arr.push(p);
    else byDay.set(iso, [p]);
  }

  const rawLines = topics
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  // A "week" is capped at 7 posts; the tail is NOT dropped — it's surfaced (overLimit)
  // and kept in the field after a run, never silently discarded.
  const topicLines = rawLines.slice(0, 7);
  const overLimit = rawLines.length > 7;

  const topicCountLabel =
    topicLines.length === 0
      ? t("topicCountZero")
      : t("batchSummary", {
          topics: topicLines.length,
          plats: platforms.size,
          posts: topicLines.length * platforms.size,
        });

  async function handlePlan() {
    if (topicLines.length === 0 || running) return;
    const remaining = await planWeek({
      topics: topicLines,
      allLines: rawLines,
      platforms: [...platforms],
      tone,
      // On-brand by default (C1): a manual voice wins, else the auto-derived
      // catalogue voice, else the project name — never a placeholder company.
      brand: brand.trim() || autoBrand || project?.name || undefined,
      // First slot today at the chosen hour; if that's already past, start
      // tomorrow. The calendar anchors to this SAME date (buildWeek above), so a
      // batch can never land on an invisible day 8.
      firstSlot: firstSlotDate(safeHour),
      pid,
    });
    if (remaining === null) return; // aborted (unmount) — saved posts stand
    // Keep only the lines the run did NOT fully persist (failed topics + the
    // over-the-cap tail) so a retry can't double-schedule what already landed.
    setTopics(remaining.join("\n"));
    window.dispatchEvent(new CustomEvent("social:posts-changed"));
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

      {/* Honest scheduling: with no connected account the cron never picks these
          posts up — warn at the surface that makes the promise. */}
      {publishBlocked && (
        <div className="mt-3 flex flex-wrap items-start gap-2 rounded-lg border border-coral-500/25 bg-coral-soft px-4 py-3 text-sm text-navy-700">
          <Info width={15} height={15} className="mt-0.5 shrink-0 text-coral-600" />
          <p className="min-w-0">
            <span className="font-semibold text-coral-600">{t("noAccountTitle")}</span> {t("noAccountBody")}
          </p>
        </div>
      )}

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
          {overLimit && (
            <p className="mt-0.5 text-xs font-medium text-coral-600">{t("overLimit", { count: rawLines.length })}</p>
          )}
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
                    {toneLabel(tn, locale)}
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
            onClick={() => void handlePlan()}
            disabled={running || topicLines.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles width={15} height={15} className={running ? "animate-pulse" : ""} />
            {running && progress ? t("generating", { done: progress.done, total: progress.total }) : t("planBtn")}
          </button>
          {error && <p className="text-xs text-negative">{error}</p>}
          {notice()}
          {batchHealth && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted">
                {t("degradedBatch", { n: batchHealth.flagged, total: batchHealth.total })}
              </p>
              <DraftHealth meta={batchHealth.meta} />
            </div>
          )}
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
