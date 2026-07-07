"use client";

/** Content Schedule — a baseline Google Business Profile post planner: an idea
 *  queue drawn from the service catalog on the left, a 4-week calendar on the
 *  right. Schedule an idea onto the next open day, then mark it published; the
 *  board persists to the project (per-user, server-side). AI drafting (via the content
 *  engine) is a documented next step — this establishes the scheduling spine
 *  (consolidation phase 5). */
import { useMemo, useState } from "react";
import { Calendar, Check, Plus } from "@/components/icons";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import type { ContentPost, PostStatus } from "@/lib/content-schedule/sample";
import { calendarGrid, ideas, nextFreeDay, statusCounts } from "@/lib/content-schedule/compute";

const T = {
  cs: {
    ideasTitle: "Náměty na příspěvky",
    ideasEmpty: "Všechny náměty naplánovány.",
    schedule: "Naplánovat",
    calendarTitle: "Kalendář (4 týdny)",
    ideaCount: "Náměty", scheduledCount: "Naplánováno", publishedCount: "Publikováno",
    publish: "Publikovat", unschedule: "Zpět do námětů",
    more: "+{n} další",
    statusIdea: "Námět", statusScheduled: "Naplánováno", statusPublished: "Publikováno",
    footer: "Naplánujte námět na den, pak publikujte na Google Business Profile. AI koncept z obsahového enginu je dalším krokem; stav se ukládá k projektu.",
  },
  en: {
    ideasTitle: "Post ideas",
    ideasEmpty: "Every idea is scheduled.",
    schedule: "Schedule",
    calendarTitle: "Calendar (4 weeks)",
    ideaCount: "Ideas", scheduledCount: "Scheduled", publishedCount: "Published",
    publish: "Publish", unschedule: "Back to ideas",
    more: "+{n} more",
    statusIdea: "Idea", statusScheduled: "Scheduled", statusPublished: "Published",
    footer: "Schedule an idea onto a day, then publish to the Google Business Profile. AI drafting from the content engine is the next step; state is saved to the project.",
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
  published: "border-positive/40 bg-positive-soft text-positive",
};

export default function ContentSchedule({
  posts: initial,
  projectId,
}: {
  posts: ContentPost[];
  projectId: string;
}) {
  const t = useT(T);
  const { locale } = useLocale();
  const weekdays = WEEKDAYS[locale === "en" ? "en" : "cs"];
  const [posts, setPosts] = useState<ContentPost[]>(initial);

  const counts = useMemo(() => statusCounts(posts), [posts]);
  const queue = useMemo(() => ideas(posts), [posts]);
  const grid = useMemo(() => calendarGrid(posts), [posts]);

  // Persist the whole board to the project (per-user, server-side). Best-effort:
  // the local state is already updated, so a save failure never blocks the UI.
  // Only a named transition (schedule/publish) surfaces on the activity feed.
  function persist(next: ContentPost[], event?: string) {
    void fetch(`/api/projects/${projectId}/state/content-schedule`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: next, ...(event ? { event } : {}) }),
    }).catch(() => {});
  }

  function schedule(id: string) {
    const day = nextFreeDay(posts);
    const next = posts.map((p) => (p.id === id ? { ...p, status: "scheduled" as PostStatus, day } : p));
    setPosts(next);
    persist(next, "scheduled");
  }
  function setStatus(id: string, status: PostStatus, day: number | null, event?: string) {
    const next = posts.map((p) => (p.id === id ? { ...p, status, day } : p));
    setPosts(next);
    persist(next, event);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-6">
        <Count label={t("ideaCount")} value={counts.idea} />
        <Count label={t("scheduledCount")} value={counts.scheduled} tone="brand" />
        <Count label={t("publishedCount")} value={counts.published} tone="positive" />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.6fr]">
        {/* Idea queue */}
        <div className="card overflow-hidden">
          <h3 className="border-b border-line px-5 py-3 text-sm font-semibold text-navy-800">{t("ideasTitle")}</h3>
          {queue.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">{t("ideasEmpty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {queue.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-navy-800">{p.title}</div>
                    <div className="text-xs text-muted">{p.service} · {p.area}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => schedule(p.id)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-accent"
                  >
                    <Plus width={13} height={13} />{t("schedule")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Calendar */}
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
                      <button
                        key={p.id}
                        type="button"
                        title={p.status === "scheduled" ? t("publish") : t("unschedule")}
                        onClick={() =>
                          p.status === "scheduled"
                            ? setStatus(p.id, "published", p.day, "published")
                            : setStatus(p.id, "idea", null)
                        }
                        className={"block w-full truncate rounded border px-1.5 py-0.5 text-left text-[10.5px] font-medium transition-colors " + STATUS_CHIP[p.status]}
                      >
                        {p.status === "published" && <Check width={9} height={9} className="mr-0.5 inline" />}
                        {p.title}
                      </button>
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
