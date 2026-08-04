"use client";

/** Content Schedule — a post planner for a local project: an idea queue drawn from
 *  the service catalog on the left, a 4-week calendar on the right. The board
 *  persists to the project (per-user, server-side).
 *
 *  WHAT THIS SURFACE MAY CLAIM. It used to have a "Publikovat" button that flipped
 *  a slot to `published` in local state and did nothing else — while the copy told
 *  the maker their Google Business Profile had been posted to. Nothing left the
 *  app. So the claim is gone and the board now has exactly two honest exits:
 *    • a REAL channel (a connected social account) — the slot is handed to the
 *      EXISTING social pipeline (`POST /api/social/posts`) as a real scheduled
 *      post, and its status is read back FROM that post on every load
 *      (reconcileWithChannel in the page). The activity row and the publish
 *      taxonomy belong to that pipeline: scheduling writes "Příspěvek naplánován"
 *      (not a publish), and the publish event is written by the social cron when
 *      the post actually goes out. This surface therefore emits NO publish event
 *      of its own — that is what keeps the publish rate from double-counting.
 *    • no channel — "označit jako hotové", a private checkmark that says so.
 *  Google Business Profile posting is NOT built here and is no longer implied. */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, Check, Info, Plus, Send, Sparkles } from "@/components/icons";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useProject } from "@/lib/projects/context";
import { isModuleAvailable } from "@/lib/projects/modules";
import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/social/types";
import { channelSendAt, type ContentPost, type PostStatus } from "@/lib/content-schedule/sample";
import { calendarGrid, nextFreeDay, statusCounts, workingList } from "@/lib/content-schedule/compute";

const T = {
  cs: {
    ideasTitle: "Náměty a plán",
    ideasEmpty: "Nezbývá nic k rozpracování.",
    schedule: "Naplánovat",
    calendarFull: "Kalendář je plný — uvolněte den, než naplánujete další příspěvek.",
    calendarTitle: "Kalendář (4 týdny)",
    ideaCount: "Náměty", scheduledCount: "V plánu", queuedCount: "V kanálu",
    publishedCount: "Zveřejněno", doneCount: "Hotovo",
    unschedule: "Zpět do námětů",
    more: "+{n} další",
    statusIdea: "Námět", statusScheduled: "V plánu", statusQueued: "Odesláno do kanálu",
    statusPublished: "Zveřejněno kanálem", statusDone: "Ručně označeno jako hotové",
    draftCopy: "Napsat text", rewrite: "Přepsat", drafting: "Píšu…",
    draftError: "Text se nepodařilo vygenerovat. Zkuste to znovu.",
    bodyLabel: "Text příspěvku",
    dayBadge: "Den {n}",
    send: "Odeslat do kanálu", sending: "Odesílám…",
    sendNeedsBody: "Nejdřív napište text příspěvku.",
    sendError: "Odeslání do kanálu se nezdařilo. Zkuste to znovu.",
    sendTitle: "Vytvoří skutečný naplánovaný příspěvek v napojeném kanálu. Zveřejní ho kanál — aplikace stav jen přebírá.",
    markDone: "Označit jako hotové",
    markDoneTitle: "Jen si odškrtnete, že máte hotovo. Nikam se nic neodesílá.",
    channelLabel: "Kanál",
    goesOut: "Vyjde {when}",
    channelFailed: "Kanál příspěvek neodeslal — je zpátky v plánu.",
    noChannelTitle: "Není napojený žádný kanál.",
    noChannelBody: "Plán je zatím jen plán — aplikace z něj nikam nic neodesílá a na Google Business Profile nepublikuje. Napojte účet a naplánované příspěvky odsud půjdou do něj.",
    noChannelLink: "Napojit sociální sítě",
    footer: "Napište text, naplánujte na den a — pokud máte napojený kanál — předejte příspěvek kanálu. Zveřejnění potvrzuje kanál, ne tato obrazovka. Stav se ukládá k projektu.",
  },
  en: {
    ideasTitle: "Ideas & plan",
    ideasEmpty: "Nothing left to work on.",
    schedule: "Schedule",
    calendarFull: "The calendar is full — free up a day before scheduling another post.",
    calendarTitle: "Calendar (4 weeks)",
    ideaCount: "Ideas", scheduledCount: "Planned", queuedCount: "In channel",
    publishedCount: "Published", doneCount: "Done",
    unschedule: "Back to ideas",
    more: "+{n} more",
    statusIdea: "Idea", statusScheduled: "Planned", statusQueued: "Handed to the channel",
    statusPublished: "Published by the channel", statusDone: "Marked done by hand",
    draftCopy: "Draft copy", rewrite: "Rewrite", drafting: "Writing…",
    draftError: "Couldn't generate the copy. Try again.",
    bodyLabel: "Post copy",
    dayBadge: "Day {n}",
    send: "Send to channel", sending: "Sending…",
    sendNeedsBody: "Write the post copy first.",
    sendError: "Handing the post to the channel failed. Try again.",
    sendTitle: "Creates a real scheduled post in your connected channel. The channel publishes it — this app only reads the status back.",
    markDone: "Mark as done",
    markDoneTitle: "Just ticks the slot off for you. Nothing is sent anywhere.",
    channelLabel: "Channel",
    goesOut: "Goes out {when}",
    channelFailed: "The channel didn't send it — it's back in the plan.",
    noChannelTitle: "No channel is connected.",
    noChannelBody: "The plan is only a plan — nothing is sent anywhere from here, and nothing is posted to a Google Business Profile. Connect an account and scheduled posts will go to it.",
    noChannelLink: "Connect social accounts",
    footer: "Draft copy, schedule it onto a day and — if you have a channel connected — hand the post to that channel. Publishing is confirmed by the channel, not by this screen. State is saved to the project.",
  },
} as const;

/** Weekday headers kept out of the `useT` dict (which is string-only). */
const WEEKDAYS = {
  cs: ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
} as const;

const STATUS_CHIP: Record<PostStatus, string> = {
  idea: "border-line bg-surface text-muted",
  scheduled: "border-brand-300 bg-brand-500/12 text-brand-accent",
  queued: "border-navy-200 bg-navy-50 text-navy-700",
  published: "border-positive/40 bg-positive-soft text-positive",
  done: "border-line bg-canvas text-muted",
};

const STATUS_LABEL_KEY: Record<PostStatus, keyof typeof T.cs> = {
  idea: "statusIdea",
  scheduled: "statusScheduled",
  queued: "statusQueued",
  published: "statusPublished",
  done: "statusDone",
};

export default function ContentSchedule({
  posts: initial,
  projectId,
  channels = [],
}: {
  posts: ContentPost[];
  projectId: string;
  /** Platforms the signed-in maker actually has connected. Empty = the board has
   *  no way out of the app, and says so instead of implying one. */
  channels?: SocialPlatform[];
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const project = useProject();
  const { locale } = useLocale();
  const weekdays = WEEKDAYS[locale === "en" ? "en" : "cs"];
  const [posts, setPosts] = useState<ContentPost[]>(initial);
  // Latest posts, readable outside the render closure. draftCopy awaits a multi-second
  // AI call and then setBody()s; without this, its handlers would map over the `posts`
  // captured at invocation time and discard (and re-persist over) any scheduling/edit
  // the user made during the await — silent data loss on a whole-board PUT.
  const postsRef = useRef(posts);
  useEffect(() => {
    postsRef.current = posts;
  });
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendErrorId, setSendErrorId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<SocialPlatform | "">(channels[0] ?? "");

  const counts = useMemo(() => statusCounts(posts), [posts]);
  const queue = useMemo(() => workingList(posts), [posts]);
  const grid = useMemo(() => calendarGrid(posts), [posts]);
  // Every day already at capacity → scheduling would strand a post; disable it.
  const boardFull = useMemo(() => nextFreeDay(posts) === null, [posts]);
  const socialLinked = isModuleAvailable(project.type, "socialni");

  // Persist the whole board to the project (per-user, server-side). Best-effort:
  // the local state is already updated, so a save failure never blocks the UI.
  // Only a named transition surfaces on the activity feed — and the ONLY one this
  // surface still names is "scheduled" (placed in the plan). The channel handoff
  // deliberately passes no event: /api/social/posts writes that row itself, and a
  // second one here would be the double-count the publish taxonomy forbids.
  function persist(next: ContentPost[], event?: string) {
    void fetch(`/api/projects/${projectId}/state/content-schedule`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: next, ...(event ? { event } : {}) }),
    }).catch(() => {});
  }

  // All mutators derive `next` from postsRef.current (the latest state), never the
  // render closure, so concurrent/deferred handlers compose instead of clobbering.
  function patch(id: string, change: Partial<ContentPost>, event?: string) {
    const next = postsRef.current.map((p) => (p.id === id ? { ...p, ...change } : p));
    setPosts(next);
    persist(next, event);
  }
  function schedule(id: string) {
    const day = nextFreeDay(postsRef.current);
    // Calendar full: don't overbook the last day (nextFreeDay now returns null) —
    // the "Naplánovat" buttons are disabled in this state, so this is a belt-and-braces guard.
    if (day === null) return;
    patch(id, { status: "scheduled", day }, "scheduled");
  }
  function unschedule(id: string) {
    patch(id, { status: "idea", day: null, channelFailed: false });
  }
  function markDone(id: string) {
    // A private checkmark. No event, no activity row, no publish taxonomy —
    // nothing left the app.
    patch(id, { status: "done" });
  }
  function setBody(id: string, body: string, persistIt = false) {
    const next = postsRef.current.map((p) => (p.id === id ? { ...p, body } : p));
    setPosts(next);
    if (persistIt) persist(next);
  }

  /** Hand a planned slot to a REAL connected channel: create a scheduled post on
   *  the existing social pipeline and link it to the slot. The slot goes to
   *  `queued` — a promise the channel now owns; only the channel can move it to
   *  `published`, which the next page load reads back. */
  async function sendToChannel(post: ContentPost) {
    if (sendingId || !platform) return;
    const content = (post.body ?? "").trim();
    if (content.length < 2) return;
    setSendingId(post.id);
    setSendErrorId(null);
    const sendAt = channelSendAt(post.day ?? 0);
    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform, content, scheduledAt: sendAt, projectId }),
      });
      const json = (await res.json()) as { post?: { id?: string; scheduledAt?: string } };
      if (!res.ok || !json?.post?.id) {
        setSendErrorId(post.id);
        return;
      }
      patch(post.id, {
        status: "queued",
        channelPostId: json.post.id,
        channelPlatform: platform,
        channelSendAt: json.post.scheduledAt || sendAt,
        channelFailed: false,
      });
    } catch {
      setSendErrorId(post.id);
    } finally {
      setSendingId(null);
    }
  }

  // Draft ready-to-post copy for a slot, grounded on the project's services and
  // brand voice. Reuses the social drafting endpoint (facebook = the closest short,
  // local, CTA-driven format) with the post title as the topic; projectId carries
  // the auto-brand grounding. The maker can then edit before handing it over.
  async function draftCopy(post: ContentPost) {
    if (draftingId) return;
    setDraftingId(post.id);
    setErrorId(null);
    try {
      const res = await fetch("/api/social/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: post.title,
          tone: "pratelsky",
          platforms: ["facebook"],
          ai: true,
          projectId,
        }),
      });
      const json = await res.json();
      const copy: string | undefined = json?.drafts?.[0]?.content;
      if (!res.ok || !copy) {
        setErrorId(post.id);
        return;
      }
      setBody(post.id, copy, true);
    } catch {
      setErrorId(post.id);
    } finally {
      setDraftingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-6">
        <Count label={t("ideaCount")} value={counts.idea} />
        <Count label={t("scheduledCount")} value={counts.scheduled} tone="brand" />
        {counts.queued > 0 && <Count label={t("queuedCount")} value={counts.queued} />}
        {counts.published > 0 && (
          <Count label={t("publishedCount")} value={counts.published} tone="positive" />
        )}
        {counts.done > 0 && <Count label={t("doneCount")} value={counts.done} />}
        {channels.length > 1 && (
          <label className="ml-auto flex items-center gap-2 text-xs font-medium text-muted">
            {t("channelLabel")}
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-navy-800 focus:border-brand-300 focus:outline-none"
            >
              {channels.map((c) => (
                <option key={c} value={c}>
                  {SOCIAL_PLATFORM_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* No way out of the app — say so, rather than offering a button that lies. */}
      {channels.length === 0 && (
        <div className="flex flex-wrap items-start gap-2 rounded-card border border-line bg-canvas/60 px-4 py-3 text-sm text-muted">
          <Info width={15} height={15} className="mt-0.5 shrink-0 text-navy-600" />
          <p className="min-w-0">
            <span className="font-semibold text-navy-800">{t("noChannelTitle")}</span>{" "}
            {t("noChannelBody")}{" "}
            {socialLinked && (
              <Link
                href={`/app/${projectId}/socialni`}
                className="font-semibold text-brand-accent hover:opacity-80"
              >
                {t("noChannelLink")}
              </Link>
            )}
          </p>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.6fr]">
        {/* Working list: ideas + slots placed on a day but not yet handed over */}
        <div className="card overflow-hidden">
          <h3 className="border-b border-line px-5 py-3 text-sm font-semibold text-navy-800">{t("ideasTitle")}</h3>
          {queue.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">{t("ideasEmpty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {queue.map((p) => {
                const hasBody = (p.body ?? "").trim().length >= 2;
                return (
                  <li key={p.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-navy-800">{p.title}</div>
                        <div className="text-xs text-muted">
                          {p.service} · {p.area}
                          {p.status === "scheduled" && p.day !== null && (
                            <> · {t("dayBadge", { n: p.day + 1 })}</>
                          )}
                        </div>
                      </div>
                      {p.status === "idea" && (
                        <button
                          type="button"
                          onClick={() => schedule(p.id)}
                          disabled={boardFull}
                          title={boardFull ? t("calendarFull") : undefined}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-navy-800"
                        >
                          <Plus width={13} height={13} />
                          {t("schedule")}
                        </button>
                      )}
                    </div>

                    {p.body ? (
                      <div className="mt-2.5">
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">{t("bodyLabel")}</label>
                        <textarea
                          value={p.body}
                          onChange={(e) => setBody(p.id, e.target.value)}
                          onBlur={(e) => setBody(p.id, e.target.value, true)}
                          rows={4}
                          className="w-full resize-y rounded-lg border border-line bg-canvas/40 px-3 py-2 text-[13px] leading-relaxed text-navy-800 focus:border-brand-300 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => draftCopy(p)}
                          disabled={draftingId !== null}
                          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-accent transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Sparkles width={13} height={13} />
                          {draftingId === p.id ? t("drafting") : t("rewrite")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => draftCopy(p)}
                        disabled={draftingId !== null}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-brand-300/60 bg-brand-500/8 px-3 py-1.5 text-xs font-semibold text-brand-accent transition-colors hover:bg-brand-500/14 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Sparkles width={13} height={13} />
                        {draftingId === p.id ? t("drafting") : t("draftCopy")}
                      </button>
                    )}
                    {errorId === p.id && <p className="mt-1.5 text-xs text-negative">{t("draftError")}</p>}

                    {p.status === "scheduled" && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {platform ? (
                          <button
                            type="button"
                            onClick={() => void sendToChannel(p)}
                            disabled={!hasBody || sendingId !== null}
                            title={hasBody ? t("sendTitle") : t("sendNeedsBody")}
                            className="inline-flex items-center gap-1.5 rounded-pill bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Send width={13} height={13} />
                            {sendingId === p.id ? t("sending") : t("send")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markDone(p.id)}
                            title={t("markDoneTitle")}
                            className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-accent"
                          >
                            <Check width={13} height={13} />
                            {t("markDone")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => unschedule(p.id)}
                          className="text-xs font-medium text-muted transition-colors hover:text-navy-800"
                        >
                          {t("unschedule")}
                        </button>
                      </div>
                    )}
                    {p.channelFailed && <p className="mt-1.5 text-xs text-negative">{t("channelFailed")}</p>}
                    {sendErrorId === p.id && <p className="mt-1.5 text-xs text-negative">{t("sendError")}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Calendar — a read-only picture of the board. Actions live next to the
            copy they act on (left), so no calendar chip can claim a transition
            the app didn't perform. */}
        <div className="card overflow-hidden">
          <h3 className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-semibold text-navy-800">
            <Calendar width={16} height={16} className="text-brand-accent" />
            {t("calendarTitle")}
          </h3>
          <div className="p-4">
            <div className="grid grid-cols-7 gap-1.5">
              {weekdays.map((d) => (
                <div key={d} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">{d}</div>
              ))}
              {grid.map((cell, day) => (
                <div key={day} className="min-h-[68px] rounded-lg border border-line/70 bg-canvas/40 p-1.5">
                  <div className="tnum text-[10px] font-semibold text-muted">{day + 1}</div>
                  <div className="mt-1 space-y-1">
                    {cell.slice(0, 2).map((p) => (
                      <div
                        key={p.id}
                        title={
                          t(STATUS_LABEL_KEY[p.status]) +
                          (p.status === "queued" && p.channelSendAt
                            ? ` — ${t("goesOut", { when: fmt.fmtDateTime(p.channelSendAt) })}`
                            : "")
                        }
                        className={"block w-full truncate rounded border px-1.5 py-0.5 text-left text-[10.5px] font-medium " + STATUS_CHIP[p.status]}
                      >
                        {p.status === "published" && <Check width={9} height={9} className="mr-0.5 inline" />}
                        {p.status === "queued" && <Send width={9} height={9} className="mr-0.5 inline" />}
                        {p.title}
                      </div>
                    ))}
                    {cell.length > 2 && (
                      <div className="text-[10px] text-muted">{t("more", { n: cell.length - 2 })}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-line px-5 py-3 text-xs text-muted">{t("footer")}</div>
        </div>
      </div>
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "brand" | "positive" }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={"tnum mt-1 text-2xl font-semibold " + (tone === "brand" ? "text-brand-accent" : tone === "positive" ? "text-positive" : "text-navy-800")}>{value}</p>
    </div>
  );
}
