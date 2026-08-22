"use client";

/** Fronta — the urgent, finishable subset. Deliberately NOT "every open lead,
 *  ranked": at a thousand contacts a ranked list is a database view wearing a
 *  to-do list's clothes, and the full database already has a tab of its own. This
 *  is the capped set whose clock is running, with the band figures coming from the
 *  server's ONE bounded aggregate rather than from the rows on screen.
 *
 *  Both bounds (the aggregate's scan window and this list's fetch window) are
 *  stated in the footnote — a queue that silently described a slice as "your
 *  leads" would be the expensive kind of wrong. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { Clock } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { Contact } from "@/lib/leads/types";
import { contactSla, urgentQueue, LEAD_SLA_TARGET_MIN, URGENT_QUEUE_CAP, type SlaPhase } from "@/lib/leads/sla";
import { seedTwinReply, schrankaHref } from "./handoff";
import { STAGE_T } from "./copy";
import { useLeadSummary } from "./useLeadSummary";
import LeadQueueRow from "./LeadQueueRow";

/** How many recent contacts the queue pulls to pick its urgent subset from. */
const QUEUE_FETCH = 200;

const T = {
  cs: {
    medianTitle: "Medián reakce", medianEmpty: "zatím bez odpovědi",
    slaTitle: "V limitu SLA", slaGoal: "cíl do {min} minut", slaEmpty: "zatím není co měřit",
    waitingTitle: "Čeká na odpověď", overdue: "{n} po termínu", allOnTrack: "vše v limitu",
    weekTitle: "Tento týden", weekLeads: "{n} leadů", weekBreak: "{q} kvalifikováno · {w} vyhráno",
    sortNote: "Řazeno: termín SLA, pak skóre",
    empty: "Inbox nula — nikdo nečeká. Nové leady se objeví tady.",
    minutes: "{n} min",
    overflow: "Zobrazeno prvních {cap}; čeká ještě {n}. Vyřiďte tyto a načtěte zbytek.",
    bounds: "Fronta vybírá z posledních {fetch} kontaktů, souhrnná čísla ze {scan} — u větších databází jde o výřez, ne o celý projekt.",
    loading: "Načítám frontu…",
  },
  en: {
    medianTitle: "Median response", medianEmpty: "nothing answered yet",
    slaTitle: "Within SLA", slaGoal: "target under {min} minutes", slaEmpty: "nothing to measure yet",
    waitingTitle: "Awaiting a reply", overdue: "{n} past due", allOnTrack: "all within target",
    weekTitle: "This week", weekLeads: "{n} leads", weekBreak: "{q} qualified · {w} won",
    sortNote: "Sorted by SLA deadline, then score",
    empty: "Inbox zero — nobody is waiting. New leads show up here.",
    minutes: "{n} min",
    overflow: "Showing the first {cap}; {n} more are waiting. Clear these and load the rest.",
    bounds: "The queue picks from the {fetch} most recent contacts and the band from {scan} — on a larger database that is a slice, not the whole project.",
    loading: "Loading the queue…",
  },
} as const;

export default function LeadQueue({
  projectId,
  live,
  reloadKey,
  onOpen,
  onAdvance,
}: {
  projectId: string;
  live: boolean;
  /** bumped by the shell after a write, so the queue and the band refetch together */
  reloadKey: number;
  onOpen: (c: Contact) => void;
  onAdvance: (c: Contact) => Promise<void>;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const stage = useT(STAGE_T);
  const router = useRouter();
  const { summary } = useLeadSummary(projectId, reloadKey);

  const [pool, setPool] = useState<Contact[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/crm/contacts?limit=${QUEUE_FETCH}`
        );
        const json = (await res.json()) as { contacts?: Contact[] };
        if (!cancelled) setPool(json.contacts ?? []);
      } catch {
        if (!cancelled) setPool([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  // One clock for the whole queue, and the first tick is SCHEDULED so the server
  // and the first client render agree on the markup.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const ready = now !== null;
  const nowMs = now ?? 0;
  const { rows, overflow } = ready && pool ? urgentQueue(pool, nowMs) : { rows: [], overflow: 0 };
  const a = summary?.analytics ?? null;
  const dash = (v: string | null) => (a === null ? "—" : v ?? "—");

  return (
    <div className="stagger space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("medianTitle")}
          value={dash(a?.medianResponseMin == null ? null : t("minutes", { n: fmt.fmtInt(a.medianResponseMin) }))}
          note={a?.medianResponseMin == null ? t("medianEmpty") : t("slaGoal", { min: LEAD_SLA_TARGET_MIN })}
        />
        <Stat
          label={t("slaTitle")}
          value={dash(a?.withinSlaRatio == null ? null : fmt.fmtPct(a.withinSlaRatio))}
          note={a?.withinSlaRatio == null ? t("slaEmpty") : t("slaGoal", { min: LEAD_SLA_TARGET_MIN })}
          tone={a?.withinSlaRatio != null && a.withinSlaRatio < 0.8 ? "negative" : undefined}
        />
        <Stat
          label={t("waitingTitle")}
          value={dash(a ? fmt.fmtInt(a.waiting) : null)}
          note={a && a.breached > 0 ? t("overdue", { n: fmt.fmtInt(a.breached) }) : t("allOnTrack")}
          tone={a && a.breached > 0 ? "negative" : undefined}
        />
        <Stat
          label={t("weekTitle")}
          value={dash(a ? t("weekLeads", { n: fmt.fmtInt(a.weekLeads) }) : null)}
          note={
            a
              ? t("weekBreak", { q: fmt.fmtInt(a.weekQualified), w: fmt.fmtInt(a.weekWon) })
              : t("sortNote")
          }
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-navy-800">
            <Clock width={15} height={15} className="text-muted" />
            {t("waitingTitle")}
            <Pill tone="navy">{fmt.fmtInt(rows.length)}</Pill>
          </span>
          <span className="text-xs text-muted">{t("sortNote")}</span>
        </div>

        {pool === null || !ready ? (
          <p className="px-5 py-10 text-center text-sm text-muted">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c) => {
              const sla = contactSla(c, nowMs);
              return (
                <LeadQueueRow
                  key={c.id}
                  contact={c}
                  phase={sla.phase as SlaPhase}
                  remainingMin={sla.remainingMin}
                  pending={false}
                  stageLabel={stage(c.stage)}
                  live={live}
                  onOpen={() => onOpen(c)}
                  onReply={() => {
                    seedTwinReply(projectId, c, c.notes ?? "");
                    router.push(schrankaHref(projectId));
                  }}
                  onAdvance={() => void onAdvance(c)}
                />
              );
            })}
          </ul>
        )}

        {overflow > 0 && (
          <p className="border-t border-line px-5 py-2.5 text-xs text-muted">
            {t("overflow", { cap: URGENT_QUEUE_CAP, n: fmt.fmtInt(overflow) })}
          </p>
        )}
      </div>

      <p className="text-xs text-muted">
        {t("bounds", { fetch: QUEUE_FETCH, scan: fmt.fmtInt(summary?.scanned ?? 0) })}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "negative";
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="tnum mt-1.5 text-2xl font-semibold text-navy-800">{value}</p>
      <p className={`mt-1 text-xs ${tone === "negative" ? "text-negative" : "text-muted"}`}>{note}</p>
    </div>
  );
}
