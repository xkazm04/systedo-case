"use client";

/** Variant B — the prioritised SLA work queue, the module's LANDING view.
 *
 *  Not a list of everything: the answer to "what do I do next", ranked by what is
 *  actually being lost (deadline first, grade second). Every figure in the band is
 *  derived from the SAME contact set the rows render, so a tile can never disagree
 *  with the list underneath it, and a row's reply button hands off to Schránka
 *  rather than growing a second reply surface here. */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { Clock } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { Contact } from "@/lib/leads/types";
import { contactSla, isQueued, queueAnalytics, sortQueue, LEAD_SLA_TARGET_MIN, type SlaPhase } from "./leadSla";
import { seedTwinReply, schrankaHref } from "./handoff";
import { STAGE_T } from "./copy";
import LeadQueueRow from "./LeadQueueRow";

const T = {
  cs: {
    medianTitle: "Medián reakce", medianEmpty: "zatím bez odpovědi",
    slaTitle: "V limitu SLA", slaGoal: "cíl do {min} minut", slaEmpty: "zatím není co měřit",
    waitingTitle: "Čeká na odpověď", overdue: "{n} po termínu", allOnTrack: "vše v limitu",
    weekTitle: "Tento týden", weekLeads: "{n} leadů", weekBreak: "{q} kvalifikováno · {w} vyhráno",
    sortNote: "Řazeno: termín SLA, pak skóre",
    empty: "Inbox nula — nikdo nečeká. Nové leady se objeví tady.",
    minutes: "{n} min",
  },
  en: {
    medianTitle: "Median response", medianEmpty: "nothing answered yet",
    slaTitle: "Within SLA", slaGoal: "target under {min} minutes", slaEmpty: "nothing to measure yet",
    waitingTitle: "Awaiting a reply", overdue: "{n} past due", allOnTrack: "all within target",
    weekTitle: "This week", weekLeads: "{n} leads", weekBreak: "{q} qualified · {w} won",
    sortNote: "Sorted by SLA deadline, then score",
    empty: "Inbox zero — nobody is waiting. New leads show up here.",
    minutes: "{n} min",
  },
} as const;

export default function LeadQueue({
  projectId,
  contacts,
  live,
  onOpen,
  onAdvance,
}: {
  projectId: string;
  contacts: Contact[];
  live: boolean;
  onOpen: (c: Contact) => void;
  onAdvance: (c: Contact) => void;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const stage = useT(STAGE_T);
  const router = useRouter();

  // One clock for the whole queue — never one timer per row. Started after mount
  // so the server and the first client render agree on the markup.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    // The first tick is scheduled, not called inline: reading the clock during the
    // effect would set state synchronously and cascade a second render.
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  // Until the first tick lands, the countdowns render as "—": the server has no
  // clock the client would agree with, and a hydration mismatch on every row is a
  // worse trade than one frame of dashes.
  const ready = now !== null;
  const nowMs = now ?? 0;

  const rows = useMemo(() => sortQueue(contacts.filter(isQueued)), [contacts]);
  const a = useMemo(() => queueAnalytics(contacts, nowMs), [contacts, nowMs]);
  const dash = (v: string) => (ready ? v : "—");

  const reply = (c: Contact) => {
    seedTwinReply(projectId, c, c.notes ?? "");
    router.push(schrankaHref(projectId));
  };

  return (
    <div className="stagger space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("medianTitle")}
          value={dash(a.medianResponseMin === null ? "—" : t("minutes", { n: fmt.fmtInt(a.medianResponseMin) }))}
          note={a.medianResponseMin === null ? t("medianEmpty") : t("slaGoal", { min: LEAD_SLA_TARGET_MIN })}
        />
        <Stat
          label={t("slaTitle")}
          value={dash(a.withinSlaRatio === null ? "—" : fmt.fmtPct(a.withinSlaRatio))}
          note={a.withinSlaRatio === null ? t("slaEmpty") : t("slaGoal", { min: LEAD_SLA_TARGET_MIN })}
          tone={ready && a.withinSlaRatio !== null && a.withinSlaRatio < 0.8 ? "negative" : undefined}
        />
        <Stat
          label={t("waitingTitle")}
          value={dash(fmt.fmtInt(a.waiting))}
          note={ready && a.breached > 0 ? t("overdue", { n: fmt.fmtInt(a.breached) }) : t("allOnTrack")}
          tone={ready && a.breached > 0 ? "negative" : undefined}
        />
        <Stat
          label={t("weekTitle")}
          value={dash(t("weekLeads", { n: fmt.fmtInt(a.weekLeads) }))}
          note={t("weekBreak", { q: fmt.fmtInt(a.weekQualified), w: fmt.fmtInt(a.weekWon) })}
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

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c) => {
              const sla = ready ? contactSla(c, nowMs) : null;
              return (
                <LeadQueueRow
                  key={c.id}
                  contact={c}
                  phase={sla?.phase ?? ("ontrack" as SlaPhase)}
                  remainingMin={sla?.remainingMin ?? 0}
                  pending={!ready}
                  stageLabel={stage(c.stage)}
                  live={live}
                  onOpen={() => onOpen(c)}
                  onReply={() => reply(c)}
                  onAdvance={() => onAdvance(c)}
                />
              );
            })}
          </ul>
        )}
      </div>
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
