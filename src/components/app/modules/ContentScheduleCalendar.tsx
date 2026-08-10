"use client";

/** The content plan's 4-week calendar — a READ-ONLY picture of the board (actions
 *  live next to the copy they act on, in the working list), extracted from
 *  ContentSchedule so that module stays under the component-size rule.
 *
 *  ACCESSIBILITY (why the chips are buttons). The day chips used to be inert
 *  `<div>`s whose entire state — "handed to the channel", "goes out on the 4th at
 *  9:00" — lived in a `title=` attribute. `title` is reachable by neither keyboard
 *  nor touch nor a screen reader's default reading, so on those inputs the calendar
 *  simply did not say what any slot's state was. And the `+{n} další` overflow was
 *  a dead label: the posts beyond the first two were unreachable by ANY input.
 *
 *  So: a chip is a real `<button>` that discloses its state inline (the status, and
 *  the send time when a channel owns it), the status is additionally announced by a
 *  screen reader without expanding anything (`sr-only`), and the overflow is a
 *  button that reveals the rest of the day. Nothing here mutates the board. */
import { useState } from "react";
import { Calendar, Check, Send } from "@/components/icons";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useFormatters, useT } from "@/lib/i18n/client";
import { calendarGrid } from "@/lib/content-schedule/compute";
import type { ContentPost, PostStatus } from "@/lib/content-schedule/sample";

const T = {
  cs: {
    calendarTitle: "Kalendář (4 týdny)",
    dayLabel: "Den {n}",
    more: "+{n} další",
    less: "Skrýt",
    statusIdea: "Námět",
    statusScheduled: "V plánu",
    statusQueued: "Odesláno do kanálu",
    statusPublished: "Publikováno kanálem",
    statusDone: "Ručně označeno jako hotové",
    statusWithdrawn: "Kanál příspěvek už nemá — zpátky v plánu",
    goesOut: "Vyjde {when}",
    chipHint: "Zobrazit stav",
  },
  en: {
    calendarTitle: "Calendar (4 weeks)",
    dayLabel: "Day {n}",
    more: "+{n} more",
    less: "Hide",
    statusIdea: "Idea",
    statusScheduled: "Planned",
    statusQueued: "Handed to the channel",
    statusPublished: "Published by the channel",
    statusDone: "Marked done by hand",
    statusWithdrawn: "The channel no longer has it — back in the plan",
    goesOut: "Goes out {when}",
    chipHint: "Show status",
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

/** How many chips a day shows before the rest go behind the overflow button. */
const VISIBLE_PER_DAY = 2;

export default function ContentScheduleCalendar({
  posts,
  footer,
}: {
  posts: ContentPost[];
  /** the board-wide honesty footer — owned by the parent module's dictionary */
  footer: string;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const { locale } = useLocale();
  const weekdays = WEEKDAYS[locale === "en" ? "en" : "cs"];
  const grid = calendarGrid(posts);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [openChip, setOpenChip] = useState<string | null>(null);

  /** The slot's state in words — the string that used to hide in `title=`. */
  const stateLine = (p: ContentPost) => {
    const base = p.channelWithdrawn && p.status === "scheduled"
      ? t("statusWithdrawn")
      : t(STATUS_LABEL_KEY[p.status]);
    return p.status === "queued" && p.channelSendAt
      ? `${base} · ${t("goesOut", { when: fmt.fmtDateTime(p.channelSendAt) })}`
      : base;
  };

  return (
    <div className="card overflow-hidden">
      <h3 className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-semibold text-navy-800">
        <Calendar width={16} height={16} className="text-brand-accent" />
        {t("calendarTitle")}
      </h3>
      <div className="p-4">
        <div className="grid grid-cols-7 gap-1.5">
          {weekdays.map((d) => (
            <div key={d} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
              {d}
            </div>
          ))}
          {grid.map((cell, day) => {
            const expanded = expandedDay === day;
            const shown = expanded ? cell : cell.slice(0, VISIBLE_PER_DAY);
            return (
              <div
                key={day}
                role="group"
                aria-label={t("dayLabel", { n: day + 1 })}
                className="min-h-[68px] rounded-lg border border-line/70 bg-canvas/40 p-1.5"
              >
                <div className="tnum text-[10px] font-semibold text-muted" aria-hidden>
                  {day + 1}
                </div>
                <ul className="mt-1 space-y-1">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setOpenChip((cur) => (cur === p.id ? null : p.id))}
                        aria-expanded={openChip === p.id}
                        title={t("chipHint")}
                        className={
                          "block w-full truncate rounded border px-1.5 py-0.5 text-left text-[10.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 " +
                          STATUS_CHIP[p.status]
                        }
                      >
                        {p.status === "published" && <Check width={9} height={9} className="mr-0.5 inline" />}
                        {p.status === "queued" && <Send width={9} height={9} className="mr-0.5 inline" />}
                        {p.title}
                        {/* Announced without expanding: the state was never in the
                            accessible name, only in an unreachable title=. */}
                        <span className="sr-only"> — {stateLine(p)}</span>
                      </button>
                      {openChip === p.id && (
                        <p className="mt-0.5 px-1.5 text-[10px] leading-snug text-muted">{stateLine(p)}</p>
                      )}
                    </li>
                  ))}
                </ul>
                {cell.length > VISIBLE_PER_DAY && (
                  <button
                    type="button"
                    onClick={() => setExpandedDay(expanded ? null : day)}
                    aria-expanded={expanded}
                    className="mt-1 rounded px-1 text-[10px] text-muted transition-colors hover:text-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {expanded ? t("less") : t("more", { n: cell.length - VISIBLE_PER_DAY })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="border-t border-line px-5 py-3 text-xs text-muted">{footer}</div>
    </div>
  );
}
