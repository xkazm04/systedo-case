"use client";

import { useEffect, useMemo, useState } from "react";
import { SLA_TARGET_MIN } from "@/lib/speed-lead/draft";
import { computeResponseAnalytics, type LeadOutcome, type ResponseAnalytics } from "@/lib/speed-lead/analytics";
import type { InboundLead } from "@/lib/speed-lead/sample";

const SLA_TARGET_SEC = SLA_TARGET_MIN * 60;
/** ≤ this many seconds left → pre-breach warning state. */
const WARNING_THRESHOLD_SEC = 60;

/** Format remaining seconds as m:ss (e.g. 3:07) — locale-neutral countdown.
 *  Human durations ("42 s", "3,5 min") come from the shared `fmt.fmtDuration`,
 *  which follows the active locale instead of hardcoding cs-CZ. */
export function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type SlaPhase = "ontrack" | "warning" | "breached";

export interface SlaState {
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

export interface LeadSla {
  /** Live SLA per lead; responded leads are settled and never overdue. */
  slaById: Map<string, SlaState>;
  /** An open lead whose SLA has breached. */
  isOverdue: (l: InboundLead) => boolean;
  overdueCount: number;
  /** Response-time analytics band figures. */
  analytics: ResponseAnalytics;
  /** Breaching leads pinned to the top; original order kept as a stable secondary sort. */
  sortedLeads: InboundLead[];
  /** id → measured response time (seconds from arrival) once "Send" fires. */
  respondedAt: Map<string, number>;
  /** Record the measured response time for a lead the first time it is answered. */
  markResponded: (leadId: string) => void;
}

/** Owns the live SLA countdown + response-time analytics for the inbox: a single
 *  1s clock, pinned per-lead arrival times, the measured-response map, and the
 *  derived SLA/analytics/sort. State-only — the inbox JSX and selection live in
 *  the shell; this hook just feeds it. Client-only, no server imports. */
export function useLeadSla(leads: InboundLead[]): LeadSla {
  /** id → measured response time (seconds from arrival) once "Send" fires. */
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

  /** Measure and pin a lead's response time the first time it is answered. */
  function markResponded(leadId: string) {
    setRespondedAt((m) => {
      if (m.has(leadId)) return m;
      const arrival = arrivalAt.get(leadId) ?? now;
      const responseSec = Math.max(0, Math.round((now - arrival) / 1000));
      return new Map(m).set(leadId, responseSec);
    });
  }

  return { slaById, isOverdue, overdueCount, analytics, sortedLeads, respondedAt, markResponded };
}
