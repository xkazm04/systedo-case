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
 *  Google Business Profile posting is NOT built here and is no longer implied.
 *
 *  DEMO SURFACE. The same component renders on the public /dashboard demo with a
 *  demo project id and an anonymous visitor. Every persist there 401s silently and
 *  every cross-module link bounces the visitor into a sign-in redirect, so on a
 *  demo id the writes are skipped and the links that lead out of the demo are not
 *  offered at all — the SaveToLibrary pattern (`isDemoProjectId` → render nothing)
 *  applied to a whole module. */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { useProject } from "@/lib/projects/context";
import { isDemoProjectId } from "@/lib/projects/demo";
import { isModuleAvailable } from "@/lib/projects/modules";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/social/types";
import { draftResponseMeta, type SocialDraftMeta } from "@/lib/social/draft-meta";
import { channelSendAt, type ContentPost } from "@/lib/content-schedule/sample";
import {
  clearWithdrawnLinks,
  nextFreeDay,
  planSlotSeed,
  statusCounts,
  workingList,
} from "@/lib/content-schedule/compute";
import ContentScheduleCalendar from "./ContentScheduleCalendar";
import ContentScheduleSlot, { type SlotHandlers } from "./ContentScheduleSlot";

const T = {
  cs: {
    ideasTitle: "Náměty a plán",
    ideasEmpty: "Nezbývá nic k rozpracování.",
    ideaCount: "Náměty",
    scheduledCount: "V plánu",
    queuedCount: "V kanálu",
    publishedCount: "Publikováno",
    doneCount: "Hotovo",
    channelLabel: "Kanál",
    noChannelTitle: "Není napojený žádný kanál.",
    noChannelBody:
      "Plán je zatím jen plán. Aplikace z něj nikam nic neodesílá a na Google Business Profile nepublikuje. Napojte účet a naplánované příspěvky odsud půjdou do něj.",
    noChannelLink: "Napojit sociální sítě",
    demoNote: "Tohle je ukázka. Změny na této tabuli se nikam neukládají a odkazy do ostatních modulů jsou tu vypnuté — přihlaste se a plán bude váš.",
    footer:
      "Napište text, naplánujte na den a, pokud máte napojený kanál, předejte příspěvek kanálu. Zveřejnění potvrzuje kanál, ne tato obrazovka. Stav se ukládá k projektu.",
  },
  en: {
    ideasTitle: "Ideas & plan",
    ideasEmpty: "Nothing left to work on.",
    ideaCount: "Ideas",
    scheduledCount: "Planned",
    queuedCount: "In channel",
    publishedCount: "Published",
    doneCount: "Done",
    channelLabel: "Channel",
    noChannelTitle: "No channel is connected.",
    noChannelBody:
      "The plan is only a plan. Nothing is sent anywhere from here, and nothing is posted to a Google Business Profile. Connect an account and scheduled posts will go to it.",
    noChannelLink: "Connect social accounts",
    demoNote: "This is a sample. Nothing you change on this board is saved, and the links into the other modules are switched off here — sign in and the plan becomes yours.",
    footer:
      "Draft copy, schedule it onto a day and, if you have a channel connected, hand the post to that channel. Publishing is confirmed by the channel, not by this screen. State is saved to the project.",
  },
} as const;

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
  const project = useProject();
  const router = useRouter();
  // The public demo: an anonymous visitor on a demo project id. Every write would
  // 401 and every module link would redirect to sign-in, so both are withheld.
  const demo = isDemoProjectId(projectId);
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
  // Honesty meta of the LAST AI draft (per slot): a truncated / wrong-language
  // caption must not land in the textarea looking identical to a clean one.
  const [draftHealth, setDraftHealth] = useState<{ id: string; meta: SocialDraftMeta } | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendErrorId, setSendErrorId] = useState<string | null>(null);
  // The slot whose board write must land BEFORE we navigate away from it.
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<SocialPlatform | "">(channels[0] ?? "");

  const counts = useMemo(() => statusCounts(posts), [posts]);
  const queue = useMemo(() => workingList(posts), [posts]);
  // Every day already at capacity → scheduling would strand a post; disable it.
  const boardFull = useMemo(() => nextFreeDay(posts) === null, [posts]);
  const socialLinked = isModuleAvailable(project.type, "socialni") && !demo;
  const engineLinked = isModuleAvailable(project.type, "obsahovy-engine") && !demo;

  // Persist the whole board to the project (per-user, server-side). Best-effort:
  // the local state is already updated, so a save failure never blocks the UI —
  // but the promise IS returned, because one caller (createContent) must not leave
  // the page until the write has landed. Only a named transition surfaces on the
  // activity feed — and the ONLY one this surface still names is "scheduled"
  // (placed in the plan). The channel handoff deliberately passes no event:
  // /api/social/posts writes that row itself, and a second one here would be the
  // double-count the publish taxonomy forbids.
  function persist(next: ContentPost[], event?: string): Promise<void> {
    if (demo) return Promise.resolve();
    return fetch(`/api/projects/${projectId}/state/content-schedule`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: next, ...(event ? { event } : {}) }),
    })
      .then(() => undefined)
      .catch(() => undefined);
  }

  // The persisted half of a channel withdrawal. reconcileWithChannel (in the page)
  // DERIVES `channelWithdrawn` on every load but is pure, so the dead channel link
  // it flagged would sit in the stored blob until some unrelated mutation rewrote
  // it. Strip it once, here, and write the withdrawal back — after which
  // clearWithdrawnLinks returns null and this effect is a no-op on every load.
  const swept = useRef(false);
  useEffect(() => {
    if (swept.current || demo) return;
    swept.current = true;
    const cleaned = clearWithdrawnLinks(postsRef.current);
    if (!cleaned) return;
    setPosts(cleaned);
    void persist(cleaned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // All mutators derive `next` from postsRef.current (the latest state), never the
  // render closure, so concurrent/deferred handlers compose instead of clobbering.
  function patch(id: string, change: Partial<ContentPost>, event?: string): Promise<void> {
    const next = postsRef.current.map((p) => (p.id === id ? { ...p, ...change } : p));
    setPosts(next);
    return persist(next, event);
  }
  function schedule(id: string) {
    const day = nextFreeDay(postsRef.current);
    // Calendar full: don't overbook the last day (nextFreeDay now returns null) —
    // the "Naplánovat" buttons are disabled in this state, so this is a belt-and-braces guard.
    if (day === null) return;
    void patch(id, { status: "scheduled", day }, "scheduled");
  }
  function unschedule(id: string) {
    void patch(id, { status: "idea", day: null, channelFailed: false, channelWithdrawn: false });
  }
  function markDone(id: string) {
    // A private checkmark. No event, no activity row, no publish taxonomy —
    // nothing left the app.
    void patch(id, { status: "done" });
  }
  /** Start generation FROM the plan: the slot already knows the service, the
   *  locality and the date, so the content engine opens pre-seeded from it through
   *  the EXISTING sessionStorage brief-seed bridge (the same one keywords,
   *  compare-seo and lp-experiments use) rather than from a blank workspace.
   *
   *  The board write is AWAITED before we navigate. It used to be fired and
   *  forgotten under a comment claiming it guaranteed persistence-before-leave,
   *  which it did not: the engine's link-back reads the stored board, merges
   *  `libraryEntryId` into it and writes the whole blob, and the state route is a
   *  blind last-writer-wins PUT — so a `briefStartedAt` write still in flight could
   *  land after that read and erase the pointer the engine had just recorded.
   *  Awaiting orders the two writes; see the note in the module header of
   *  lib/project-state/store for why the CAS token behind that route is deliberately
   *  process-internal and not exposed over HTTP. */
  async function createContent(post: ContentPost) {
    if (leavingId) return;
    try {
      sessionStorage.setItem(briefSeedKey(projectId), JSON.stringify(planSlotSeed(post)));
    } catch {
      /* private mode / storage full: the engine still opens, just unseeded */
    }
    setLeavingId(post.id);
    try {
      await patch(post.id, { briefStartedAt: new Date().toISOString() });
    } finally {
      setLeavingId(null);
    }
    router.push(`/app/${projectId}/obsahovy-engine`);
  }

  function setBody(id: string, body: string, persistIt = false) {
    const next = postsRef.current.map((p) => (p.id === id ? { ...p, body } : p));
    setPosts(next);
    if (persistIt) void persist(next);
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
      void patch(post.id, {
        status: "queued",
        channelPostId: json.post.id,
        channelPlatform: platform,
        channelSendAt: json.post.scheduledAt || sendAt,
        channelFailed: false,
        channelWithdrawn: false,
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
    setDraftHealth(null);
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
      // Forwarded wrapper honesty (degraded / wrong-language) — surfaced next to
      // the slot the caption landed in, via the shared draft-meta seam.
      const meta = draftResponseMeta(json);
      setDraftHealth(meta ? { id: post.id, meta } : null);
      setBody(post.id, copy, true);
    } catch {
      setErrorId(post.id);
    } finally {
      setDraftingId(null);
    }
  }

  const handlers: SlotHandlers = {
    onSchedule: schedule,
    onUnschedule: unschedule,
    onMarkDone: markDone,
    onDraft: (p) => void draftCopy(p),
    onBody: setBody,
    onSend: (p) => void sendToChannel(p),
    onCreateContent: (p) => void createContent(p),
  };

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

      {/* The demo says what it is, instead of offering writes that 401 and links
          that bounce an anonymous visitor into a sign-in redirect. */}
      {demo && (
        <div className="flex flex-wrap items-start gap-2 rounded-card border border-line bg-canvas/60 px-4 py-3 text-sm text-muted">
          <Info width={15} height={15} className="mt-0.5 shrink-0 text-navy-600" />
          <p className="min-w-0">{t("demoNote")}</p>
        </div>
      )}

      {/* No way out of the app — say so, rather than offering a button that lies. */}
      {channels.length === 0 && !demo && (
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
          <h3 className="border-b border-line px-5 py-3 text-sm font-semibold text-navy-800">
            {t("ideasTitle")}
          </h3>
          {queue.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">{t("ideasEmpty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {queue.map((p) => (
                <ContentScheduleSlot
                  key={p.id}
                  post={p}
                  projectId={projectId}
                  boardFull={boardFull}
                  canSend={platform !== ""}
                  engineLinked={engineLinked}
                  drafting={draftingId === p.id}
                  draftBusy={draftingId !== null}
                  leaving={leavingId === p.id}
                  sending={sendingId === p.id}
                  sendBusy={sendingId !== null}
                  draftError={errorId === p.id}
                  sendError={sendErrorId === p.id}
                  health={draftHealth?.id === p.id ? draftHealth.meta : null}
                  handlers={handlers}
                />
              ))}
            </ul>
          )}
        </div>

        <ContentScheduleCalendar posts={posts} footer={t("footer")} />
      </div>
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "brand" | "positive" }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p
        className={
          "tnum mt-1 text-2xl font-semibold " +
          (tone === "brand" ? "text-brand-accent" : tone === "positive" ? "text-positive" : "text-navy-800")
        }
      >
        {value}
      </p>
    </div>
  );
}
