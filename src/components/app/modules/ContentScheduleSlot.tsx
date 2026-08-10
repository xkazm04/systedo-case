"use client";

/** One row of the content plan's working list — an idea or a slot placed on a day,
 *  with every action that may act on it. Extracted from ContentSchedule (which was
 *  well past the component-size rule); the module keeps ALL the state and hands this
 *  component the already-resolved flags for THIS slot, so the row itself is a pure
 *  function of its props. */
import Link from "next/link";
import { Check, Document, Plus, Send, Sparkles } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import DraftHealth from "@/components/social/DraftHealth";
import type { SocialDraftMeta } from "@/lib/social/draft-meta";
import { slotProgress } from "@/lib/content-schedule/compute";
import type { ContentPost } from "@/lib/content-schedule/sample";

const T = {
  cs: {
    schedule: "Naplánovat",
    calendarFull: "Kalendář je plný. Uvolněte den, než naplánujete další příspěvek.",
    unschedule: "Zpět do námětů",
    draftCopy: "Napsat text",
    rewrite: "Přepsat",
    drafting: "Píšu…",
    draftError: "Text se nepodařilo vygenerovat. Zkuste to znovu.",
    bodyLabel: "Text příspěvku",
    dayBadge: "Den {n}",
    send: "Odeslat do kanálu",
    sending: "Odesílám…",
    sendNeedsBody: "Nejdřív napište text příspěvku.",
    sendError: "Odeslání do kanálu se nezdařilo. Zkuste to znovu.",
    sendTitle: "Vytvoří skutečný naplánovaný příspěvek v napojeném kanálu. Zveřejní ho kanál. Aplikace stav jen přebírá.",
    markDone: "Označit jako hotové",
    markDoneTitle: "Jen si odškrtnete, že máte hotovo. Nikam se nic neodesílá.",
    channelFailed: "Kanál příspěvek neodeslal. Je zpátky v plánu.",
    channelWithdrawn: "Příspěvek už v kanálu není — někdo ho tam smazal. Slot je zpátky v plánu, můžete ho odeslat znovu.",
    createContent: "Vytvořit obsah",
    createContentTitle: "Otevře obsahový engine s předvyplněným zadáním z tohoto slotu. Téma i klíčové slovo už znáte z plánu.",
    opening: "Otevírám…",
    progressDrafting: "Rozpracováno",
    progressDrafted: "Koncept hotový",
    savedDraft: "Uložený koncept",
  },
  en: {
    schedule: "Schedule",
    calendarFull: "The calendar is full. Free up a day before scheduling another post.",
    unschedule: "Back to ideas",
    draftCopy: "Draft copy",
    rewrite: "Rewrite",
    drafting: "Writing…",
    draftError: "Couldn't generate the copy. Try again.",
    bodyLabel: "Post copy",
    dayBadge: "Day {n}",
    send: "Send to channel",
    sending: "Sending…",
    sendNeedsBody: "Write the post copy first.",
    sendError: "Handing the post to the channel failed. Try again.",
    sendTitle: "Creates a real scheduled post in your connected channel. The channel publishes it. This app only reads the status back.",
    markDone: "Mark as done",
    markDoneTitle: "Just ticks the slot off for you. Nothing is sent anywhere.",
    channelFailed: "The channel didn't send it. It's back in the plan.",
    channelWithdrawn: "The post is no longer in the channel — someone deleted it there. The slot is back in the plan; you can send it again.",
    createContent: "Create content",
    createContentTitle: "Opens the content engine pre-filled from this slot. The topic and keyword are already decided in the plan.",
    opening: "Opening…",
    progressDrafting: "In progress",
    progressDrafted: "Draft ready",
    savedDraft: "Saved draft",
  },
} as const;

export interface SlotHandlers {
  onSchedule: (id: string) => void;
  onUnschedule: (id: string) => void;
  onMarkDone: (id: string) => void;
  onDraft: (post: ContentPost) => void;
  onBody: (id: string, body: string, persist?: boolean) => void;
  onSend: (post: ContentPost) => void;
  onCreateContent: (post: ContentPost) => void;
}

export default function ContentScheduleSlot({
  post: p,
  projectId,
  boardFull,
  canSend,
  engineLinked,
  drafting,
  draftBusy,
  leaving,
  sending,
  sendBusy,
  draftError,
  sendError,
  health,
  handlers: h,
}: {
  post: ContentPost;
  projectId: string;
  /** every calendar day is at capacity — scheduling would strand the post */
  boardFull: boolean;
  /** a channel is connected AND selected, so the handover button is honest */
  canSend: boolean;
  /** the content engine module exists for this project type */
  engineLinked: boolean;
  /** this slot is the one being drafted / any slot is (buttons lock board-wide) */
  drafting: boolean;
  draftBusy: boolean;
  /** the board is being persisted before navigating away from this slot */
  leaving: boolean;
  sending: boolean;
  sendBusy: boolean;
  draftError: boolean;
  sendError: boolean;
  health: SocialDraftMeta | null;
  handlers: SlotHandlers;
}) {
  const t = useT(T);
  const hasBody = (p.body ?? "").trim().length >= 2;
  const progress = slotProgress(p);

  return (
    <li className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-navy-800">{p.title}</div>
          <div className="text-xs text-muted">
            {p.service} · {p.area}
            {p.status === "scheduled" && p.day !== null && <> · {t("dayBadge", { n: p.day + 1 })}</>}
          </div>
          {progress !== "planned" && (
            <span
              className={
                "mt-1 inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium " +
                (progress === "drafted" ? "bg-positive-soft text-positive" : "bg-navy-50 text-navy-700")
              }
            >
              {progress === "drafted" ? t("progressDrafted") : t("progressDrafting")}
            </span>
          )}
        </div>
        {p.status === "idea" && (
          <button
            type="button"
            onClick={() => h.onSchedule(p.id)}
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
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
            {t("bodyLabel")}
          </label>
          <textarea
            value={p.body}
            onChange={(e) => h.onBody(p.id, e.target.value)}
            onBlur={(e) => h.onBody(p.id, e.target.value, true)}
            rows={4}
            className="w-full resize-y rounded-lg border border-line bg-canvas/40 px-3 py-2 text-[13px] leading-relaxed text-navy-800 focus:border-brand-300 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => h.onDraft(p)}
            disabled={draftBusy}
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-accent transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles width={13} height={13} />
            {drafting ? t("drafting") : t("rewrite")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => h.onDraft(p)}
          disabled={draftBusy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-brand-300/60 bg-brand-500/8 px-3 py-1.5 text-xs font-semibold text-brand-accent transition-colors hover:bg-brand-500/14 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles width={13} height={13} />
          {drafting ? t("drafting") : t("draftCopy")}
        </button>
      )}
      {draftError && <p className="mt-1.5 text-xs text-negative">{t("draftError")}</p>}
      {health && (
        <div className="mt-1.5">
          <DraftHealth meta={health} onRetry={() => h.onDraft(p)} />
        </div>
      )}

      {/* The calendar as a starting point: the slot already knows the topic, so the
          long-form workspace opens seeded from it. */}
      {engineLinked && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => h.onCreateContent(p)}
            disabled={leaving}
            title={t("createContentTitle")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-accent transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Document width={13} height={13} />
            {leaving ? t("opening") : t("createContent")}
          </button>
          {p.libraryEntryId && (
            <Link
              href={`/app/${projectId}/ulozeny-obsah?entry=${encodeURIComponent(p.libraryEntryId)}`}
              className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-navy-800 hover:underline"
            >
              {t("savedDraft")}
            </Link>
          )}
        </div>
      )}

      {p.status === "scheduled" && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {canSend ? (
            <button
              type="button"
              onClick={() => h.onSend(p)}
              disabled={!hasBody || sendBusy}
              title={hasBody ? t("sendTitle") : t("sendNeedsBody")}
              className="inline-flex items-center gap-1.5 rounded-pill bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send width={13} height={13} />
              {sending ? t("sending") : t("send")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => h.onMarkDone(p.id)}
              title={t("markDoneTitle")}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-accent"
            >
              <Check width={13} height={13} />
              {t("markDone")}
            </button>
          )}
          <button
            type="button"
            onClick={() => h.onUnschedule(p.id)}
            className="text-xs font-medium text-muted transition-colors hover:text-navy-800"
          >
            {t("unschedule")}
          </button>
        </div>
      )}
      {/* A failure and a withdrawal are different news: the channel tried and could
          not, versus the post is simply gone from the channel. */}
      {p.channelFailed && <p className="mt-1.5 text-xs text-negative">{t("channelFailed")}</p>}
      {p.channelWithdrawn && !p.channelFailed && (
        <p className="mt-1.5 text-xs text-coral-600">{t("channelWithdrawn")}</p>
      )}
      {sendError && <p className="mt-1.5 text-xs text-negative">{t("sendError")}</p>}
    </li>
  );
}
