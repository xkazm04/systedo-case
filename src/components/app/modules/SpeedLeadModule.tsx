"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pill } from "@/components/ui";
import NextSteps from "@/components/app/NextSteps";
import { Bell, Bolt, Check, Clock } from "@/components/icons";
import { CHANNEL_LABELS, type InboundLead } from "@/lib/speed-lead/sample";
import { draftReply, SLA_TARGET_MIN } from "@/lib/speed-lead/draft";
import { computeResponseAnalytics, type LeadOutcome } from "@/lib/speed-lead/analytics";
import { fmtPct } from "@/lib/format";

const SLA_TARGET_SEC = SLA_TARGET_MIN * 60;
/** ≤ this many seconds left → pre-breach warning state. */
const WARNING_THRESHOLD_SEC = 60;

function ago(min: number): string {
  if (min < 60) return `před ${min} min`;
  return `před ${Math.round(min / 60)} h`;
}

/** Format remaining seconds as m:ss (e.g. 3:07). */
function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Human duration for the analytics band: "42 s", "3,5 min". */
function fmtDuration(totalSec: number): string {
  if (totalSec < 60) return `${Math.round(totalSec)} s`;
  const min = totalSec / 60;
  const rounded = Math.round(min * 10) / 10;
  return `${rounded.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} min`;
}

type SlaPhase = "ontrack" | "warning" | "breached";

interface SlaState {
  /** Whole seconds left until breach; negative once breached. */
  remaining: number;
  phase: SlaPhase;
}

/** Live SLA state for a lead, given the current clock tick. */
function slaState(lead: InboundLead, nowMs: number, arrivalMs: number): SlaState {
  const elapsed = Math.floor((nowMs - arrivalMs) / 1000);
  const remaining = SLA_TARGET_SEC - elapsed;
  const phase: SlaPhase = remaining < 0 ? "breached" : remaining <= WARNING_THRESHOLD_SEC ? "warning" : "ontrack";
  return { remaining, phase };
}

export default function SpeedLeadModule({ leads }: { leads: InboundLead[] }) {
  const [selectedId, setSelectedId] = useState(leads[0]?.id ?? "");
  /** id → measured response time (seconds from arrival) once "Odeslat" fires. */
  const [respondedAt, setRespondedAt] = useState<Map<string, number>>(new Map());
  const [now, setNow] = useState(() => Date.now());

  /** Pin each lead's arrival once at mount (lazy state initializer) so countdowns
   *  are stable across ticks — refs/Date.now must not be read during render. */
  const [arrivalAt] = useState<Map<string, number>>(
    () => new Map(leads.map((l) => [l.id, Date.now() - l.minutesAgo * 60_000]))
  );

  /** One shared timer drives the whole inbox — never one per row. */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const firstBreachedRef = useRef<HTMLButtonElement | null>(null);

  const selected = leads.find((l) => l.id === selectedId) ?? leads[0];
  const draft = useMemo(() => (selected ? draftReply(selected) : null), [selected]);

  /** Live SLA per lead; responded leads are settled and never overdue. */
  const slaById = useMemo(() => {
    const map = new Map<string, SlaState>();
    for (const l of leads) map.set(l.id, slaState(l, now, arrivalAt.get(l.id) ?? now));
    return map;
  }, [leads, now, arrivalAt]);

  const isOverdue = (l: InboundLead) => !respondedAt.has(l.id) && slaById.get(l.id)?.phase === "breached";
  const overdueCount = leads.filter(isOverdue).length;

  /** Per-lead outcomes feeding the analytics band: a measured response time for
   *  answered leads, otherwise the lead's current breach state. */
  const analytics = useMemo(() => {
    const outcomes: LeadOutcome[] = leads.map((l) => ({
      channel: l.channel,
      responseSec: respondedAt.get(l.id) ?? null,
      breached: slaById.get(l.id)?.phase === "breached",
    }));
    return computeResponseAnalytics(outcomes);
  }, [leads, respondedAt, slaById]);

  /** Breaching leads pinned to the top; original order kept as a stable secondary sort. */
  const sortedLeads = useMemo(() => {
    const order = new Map(leads.map((l, i) => [l.id, i]));
    return [...leads].sort((a, b) => {
      const ao = isOverdue(a) ? 0 : 1;
      const bo = isOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, slaById, respondedAt]);

  const focusFirstBreached = () => {
    const el = firstBreachedRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const first = sortedLeads.find(isOverdue);
    if (first) setSelectedId(first.id);
  };

  if (!selected || !draft) return null;

  return (
    <div className="space-y-4">
      {/* Response-time analytics band — derived from this session's responses
          plus the live SLA state of still-open leads. */}
      <div className="flex flex-wrap items-stretch gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <div className="min-w-[120px]">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Medián reakce</p>
          <p className="tnum mt-0.5 text-lg font-semibold text-navy-800">
            {analytics.medianResponseSec != null ? fmtDuration(analytics.medianResponseSec) : "—"}
          </p>
          <p className="text-[11px] text-muted">
            {analytics.answered > 0 ? `z ${analytics.answered} odeslaných` : "zatím bez odeslání"}
          </p>
        </div>
        <div className="min-w-[120px] border-l border-line pl-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">V SLA</p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="tnum text-lg font-semibold text-navy-800">
              {analytics.withinSlaRate != null ? fmtPct(analytics.withinSlaRate, 0) : "—"}
            </p>
            {analytics.withinSlaRate != null ? (
              <Pill tone={analytics.withinSlaRate >= 0.8 ? "positive" : analytics.withinSlaRate >= 0.5 ? "coral" : "negative"}>
                cíl do {SLA_TARGET_MIN} min
              </Pill>
            ) : null}
          </div>
          <p className="text-[11px] text-muted">{analytics.judged} z {leads.length} hodnoceno</p>
        </div>
        <div className="min-w-[160px] flex-1 border-l border-line pl-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Průměr dle kanálu</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            {analytics.byChannel.length > 0 ? (
              analytics.byChannel.map((c) => (
                <span key={c.channel} className="text-xs text-navy-700">
                  {CHANNEL_LABELS[c.channel]}{" "}
                  <strong className="tnum font-semibold">
                    {c.avgResponseSec != null ? fmtDuration(c.avgResponseSec) : "—"}
                  </strong>
                </span>
              ))
            ) : (
              <span className="text-xs text-muted">zatím bez dat</span>
            )}
          </div>
        </div>
      </div>

      {overdueCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-negative/40 bg-negative-soft px-4 py-3 text-sm">
          <Bell width={16} height={16} className="shrink-0 text-negative" />
          <span className="font-semibold text-negative">
            {overdueCount} {overdueCount === 1 ? "lead" : overdueCount < 5 ? "leady" : "leadů"} po SLA
          </span>
          <span className="text-navy-700">— vyžadují okamžitou reakci.</span>
          <button
            type="button"
            onClick={focusFirstBreached}
            className="ml-auto inline-flex items-center gap-2 rounded-pill bg-negative px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
          >
            <Bolt width={14} height={14} />
            Eskalovat
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-card border border-line bg-canvas px-4 py-3 text-sm">
          <Clock width={16} height={16} className="text-brand-accent" />
          <span className="text-navy-700">
            Cíl reakce <strong>do {SLA_TARGET_MIN} min</strong>.
          </span>
          <Pill tone="positive">Vše v SLA</Pill>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* inbox */}
        <div className="space-y-2">
          {sortedLeads.map((l, i) => {
            const active = l.id === selectedId;
            const done = respondedAt.has(l.id);
            const overdue = isOverdue(l);
            const sla = slaById.get(l.id);
            const phase: SlaPhase = done ? "ontrack" : sla?.phase ?? "ontrack";
            const isFirstBreached = overdue && !sortedLeads.slice(0, i).some(isOverdue);
            return (
              <button
                key={l.id}
                ref={isFirstBreached ? firstBreachedRef : undefined}
                type="button"
                onClick={() => setSelectedId(l.id)}
                className={`w-full rounded-card border p-3 text-left transition-colors ${
                  active
                    ? "border-brand-400 bg-brand-50/60 ring-2 ring-brand-200"
                    : overdue
                      ? "border-negative/40 bg-negative-soft hover:border-negative"
                      : "border-line bg-surface hover:border-brand-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-navy-800">{l.name}</span>
                  {done ? (
                    <Pill tone="positive">
                      <Check width={12} height={12} />
                      Vyřízeno
                    </Pill>
                  ) : overdue ? (
                    <Pill tone="negative">Po SLA</Pill>
                  ) : (
                    <Pill tone="brand">Nový</Pill>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{l.message}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted">
                    {CHANNEL_LABELS[l.channel]} · {ago(l.minutesAgo)}
                  </p>
                  {!done && sla ? (
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${
                        phase === "breached" ? "text-negative" : phase === "warning" ? "text-coral-600" : "text-muted"
                      }`}
                    >
                      {phase === "breached" ? `po SLA o ${Math.ceil(-sla.remaining / 60)} min` : `zbývá ${mmss(sla.remaining)}`}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        {/* draft */}
        <div className="card p-5">
          <div className="border-b border-line pb-3">
            <h3 className="text-base font-semibold text-navy-800">{selected.name}</h3>
            <p className="mt-1 text-sm text-muted">
              {CHANNEL_LABELS[selected.channel]} · {ago(selected.minutesAgo)}
            </p>
            <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm text-navy-700">{selected.message}</p>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Návrh odpovědi</p>
            <textarea
              key={selected.id}
              defaultValue={draft.reply}
              rows={7}
              className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Kvalifikační otázky</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {draft.questions.map((q) => (
                <span key={q} className="rounded-pill bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800">
                  {q}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={() =>
                setRespondedAt((m) => {
                  if (m.has(selected.id)) return m;
                  const arrival = arrivalAt.get(selected.id) ?? now;
                  const responseSec = Math.max(0, Math.round((now - arrival) / 1000));
                  return new Map(m).set(selected.id, responseSec);
                })
              }
              disabled={respondedAt.has(selected.id)}
              className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              <Bolt width={15} height={15} />
              {respondedAt.has(selected.id) ? "Odesláno" : "Odeslat odpověď"}
            </button>
            <span className="text-xs text-muted">Odeslání se v ukázce simuluje.</span>
          </div>
        </div>
      </div>

      <NextSteps
        steps={[
          { to: "kvalita-leadu", label: "Posoudit kvalitu leadů podle zdroje", hint: "Které zdroje plní pipeline a které jen formuláře" },
          { to: "kampane", label: "Optimalizovat zdroje s pomalou reakcí", hint: "Přesunout rozpočet ke kanálům, kde reagujete v SLA" },
        ]}
      />
    </div>
  );
}
