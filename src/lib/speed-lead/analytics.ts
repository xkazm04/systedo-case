/** Pure response-time analytics for the speed-to-lead inbox: median response
 *  time, % of leads answered within the SLA target, and average response time
 *  per channel. Derived from per-lead outcomes (a measured response time, or a
 *  not-yet-answered lead's current breach state) so the UI band stays honest.
 *  No React, no clock reads — testable in isolation. */
import type { LeadChannel } from "./sample";
import { SLA_TARGET_MIN } from "./draft";

const SLA_TARGET_SEC = SLA_TARGET_MIN * 60;

/** One lead's outcome for the analytics roll-up. */
export interface LeadOutcome {
  channel: LeadChannel;
  /** Seconds from arrival to response, once answered; null while still open. */
  responseSec: number | null;
  /** For an open lead: is it already past the SLA target right now? */
  breached: boolean;
}

export interface ChannelStat {
  channel: LeadChannel;
  /** Average measured response time (seconds) for answered leads on this channel. */
  avgResponseSec: number | null;
  /** How many answered leads back the average. */
  answered: number;
}

export interface ResponseAnalytics {
  /** Median measured response time (seconds) across answered leads; null if none. */
  medianResponseSec: number | null;
  /** Fraction (0–1) of leads with a SETTLED SLA outcome (answered-within-target or
   *  breached) that hit the target; null when no lead can be judged yet. Open, not-yet-
   *  breached leads are NOT judged — counting them as hits made the band non-monotonic
   *  (a flattering 100% exactly when fresh leads pile up unanswered). */
  withinSlaRate: number | null;
  /** How many leads have a settled outcome behind the SLA-hit rate. */
  judged: number;
  /** Open leads still within target — pending, deliberately excluded from `judged`. */
  atRisk: number;
  /** How many leads have a measured response time. */
  answered: number;
  /** Per-channel averages, only for channels with ≥1 answered lead. */
  byChannel: ChannelStat[];
}

/** Median of a numeric list. Empty → null. Sorts a copy (non-mutating). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Roll per-lead outcomes up into the analytics-band figures. The SLA rate scores only
 *  SETTLED outcomes — answered-within-target (hit) and breached (miss). An open,
 *  not-yet-breached lead has no verdict yet, so it is counted in `atRisk`, never as a
 *  hit; pre-counting it as a win made the rate drop as time passed and read 100% when
 *  fresh leads were piling up unanswered — the opposite of the signal this product sells. */
export function computeResponseAnalytics(outcomes: LeadOutcome[]): ResponseAnalytics {
  const responseTimes = outcomes
    .map((o) => o.responseSec)
    .filter((s): s is number => s != null);

  let hits = 0;
  let judged = 0;
  let atRisk = 0;
  for (const o of outcomes) {
    if (o.responseSec != null) {
      judged += 1;
      if (o.responseSec <= SLA_TARGET_SEC) hits += 1;
    } else if (o.breached) {
      // An open, already-breached lead is a definite miss — a settled verdict.
      judged += 1;
    } else {
      // Open and still within target → no verdict yet; visible as at-risk, not a win.
      atRisk += 1;
    }
  }

  const byChannel: ChannelStat[] = [];
  const seen = new Map<LeadChannel, number[]>();
  for (const o of outcomes) {
    if (o.responseSec == null) continue;
    const list = seen.get(o.channel) ?? [];
    list.push(o.responseSec);
    seen.set(o.channel, list);
  }
  for (const [channel, list] of seen) {
    const sum = list.reduce((a, b) => a + b, 0);
    byChannel.push({ channel, avgResponseSec: sum / list.length, answered: list.length });
  }

  return {
    medianResponseSec: median(responseTimes),
    withinSlaRate: judged === 0 ? null : hits / judged,
    judged,
    atRisk,
    answered: responseTimes.length,
    byChannel,
  };
}
