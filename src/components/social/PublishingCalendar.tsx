"use client";

/** ONE publishing calendar. Four schedulers plan onto the same channels — the
 *  social centre, the content-plan board, the twin outbox and Distribuce — and
 *  each showed only its own half, so "what actually goes out this week" was a
 *  question nobody could answer without opening four modules. This is the read
 *  side of that union (GET /api/projects/[id]/publishing): the current local week
 *  as a seven-day strip, each item a chip coloured by the module that owns it and
 *  linking back to it, with the enforced per-channel cadence meters underneath.
 *
 *  It renders nothing it cannot stand behind: a source whose store read FAILED is
 *  NAMED, never folded into an empty day — an operator who reads a blank Wednesday
 *  as "free" will post over something that is already there. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, Info } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useOptionalProject } from "@/lib/projects/context";
import { weekCadence } from "@/lib/publishing/cadence";
import { CHANNEL_KEY_LABELS } from "@/lib/publishing/channel-key";
import type {
  PublishingCalendar as CalendarData,
  PublishingItem,
  PublishingSource,
} from "@/lib/publishing/types";
import CadenceMeter from "./CadenceMeter";

const T = {
  cs: {
    title: "Kalendář publikování",
    subtitle: "Vše, co tento týden vychází — ze sociálních sítí, plánu obsahu, twinu i distribuce.",
    empty: "—",
    loading: "Načítám…",
    unavailable:
      "Nepodařilo se načíst: {sources}. Týden proto není úplný — prázdno tu neukazujeme, aby se nepletlo s „nic naplánováno“.",
    social: "Sociální sítě",
    "content-plan": "Plán obsahu",
    twin: "Twin",
    distribution: "Distribuce",
    planned: "V plánu",
    scheduled: "Naplánováno",
    published: "Publikováno",
    sent: "Odesláno",
    failed: "Chyba",
  },
  en: {
    title: "Publishing calendar",
    subtitle: "Everything going out this week — from social, the content plan, the twin and Distribution.",
    empty: "—",
    loading: "Loading…",
    unavailable:
      "Could not load: {sources}. The week is therefore incomplete — we don't show a blank instead, so it can't be read as “nothing planned”.",
    social: "Social",
    "content-plan": "Content plan",
    twin: "Twin",
    distribution: "Distribution",
    planned: "Planned",
    scheduled: "Scheduled",
    published: "Published",
    sent: "Sent",
    failed: "Failed",
  },
} as const;

/** Chip colour per owning module — what makes a mixed week legible at a glance.
 *  Semantic tokens only, so both themes follow. */
const SOURCE_CHIP: Record<PublishingSource, string> = {
  social: "border-brand-200 bg-brand-50/60 text-brand-800",
  "content-plan": "border-line bg-positive-soft text-positive",
  twin: "border-line bg-navy-50 text-navy-700",
  distribution: "border-coral-500/25 bg-coral-soft text-coral-600",
};

/** YYYY-MM-DD in LOCAL time — the rule WeekPlanner and `weekStartIso` share, so a
 *  chip lands in the cell whose date it reads as. */
function localIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The seven days of the CURRENT local week, Monday first — the same week the cap
 *  is counted over, so the meters and the strip cannot disagree. */
function weekDays(now: Date): string[] {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localIso(d);
  });
}

export default function PublishingCalendar() {
  const project = useOptionalProject();
  const pid = project?.id;
  const t = useT(T);
  const fmt = useFormatters();
  const [data, setData] = useState<CalendarData | null>(null);
  // The week depends on the CLIENT clock, so it is built in an effect: deriving it
  // in render would hydrate against a different server date near midnight.
  const [days, setDays] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDays(weekDays(new Date()));
    if (!pid) return;
    const ctrl = new AbortController();
    fetch(`/api/projects/${pid}/publishing`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CalendarData>) : null))
      .then((json) => json && setData(json))
      .catch(() => {
        /* aborted or offline — the loading line stands, nothing is claimed */
      });
    return () => ctrl.abort();
  }, [pid]);

  if (!pid) return null;

  const byDay = new Map<string, PublishingItem[]>();
  for (const item of data?.items ?? []) {
    const at = new Date(item.at);
    if (Number.isNaN(at.getTime())) continue;
    const key = localIso(at);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }

  const broken = (Object.entries(data?.sources ?? {}) as [PublishingSource, string][])
    .filter(([, health]) => health === "error")
    .map(([source]) => t(source));
  const anchor = days[0] ? `${days[0]}T12:00:00` : new Date().toISOString();
  const checks = data ? weekCadence(data.items, anchor, data.rules) : [];

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2">
        <Calendar width={18} height={18} className="shrink-0 text-brand-accent" />
        <h2 className="text-base font-semibold text-ink">{t("title")}</h2>
      </div>
      <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>

      {broken.length > 0 && (
        <div className="mt-3 flex flex-wrap items-start gap-2 rounded-lg border border-coral-500/25 bg-coral-soft px-4 py-3 text-sm text-navy-700">
          <Info width={15} height={15} className="mt-0.5 shrink-0 text-coral-600" />
          <p className="min-w-0">{t("unavailable", { sources: broken.join(", ") })}</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((iso) => (
          <div key={iso} className="rounded-lg border border-line bg-surface p-2.5">
            <p className="text-xs font-semibold capitalize text-navy-700">{fmt.fmtWeekdayShort(iso)}</p>
            <p className="text-[11px] text-muted">{fmt.fmtDateShort(iso)}</p>
            <div className="mt-1.5 space-y-1.5">
              {(byDay.get(iso) ?? []).map((item) => (
                <Link
                  key={item.id}
                  href={item.href ?? `/app/${pid}/socialni`}
                  className={`block rounded-md border p-1.5 transition-opacity hover:opacity-80 ${SOURCE_CHIP[item.source]}`}
                >
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
                    {t(item.source)}
                    <span className="ml-auto inline-flex items-center gap-0.5 font-normal normal-case opacity-80">
                      <Clock width={9} height={9} />
                      {fmt.fmtTime(item.at)}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug">{item.title}</span>
                  <span className="mt-0.5 block text-[10px] opacity-80">
                    {CHANNEL_KEY_LABELS[item.channel]} · {t(item.status)}
                  </span>
                </Link>
              ))}
              {(byDay.get(iso) ?? []).length === 0 && (
                <p className="text-[11px] text-muted">{data ? t("empty") : t("loading")}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <CadenceMeter checks={checks} />
      </div>
    </div>
  );
}
