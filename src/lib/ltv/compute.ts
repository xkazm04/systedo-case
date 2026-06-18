/** CAC / LTV / payback math over acquisition cohorts. Extrapolates the retention
 *  tail geometrically to a fixed horizon, then derives lifetime value, the
 *  LTV:CAC ratio and the payback month. Pure. */
import type { Cohort, CohortChannel } from "./sample";
import { isPaidChannel } from "./sample";

export const LTV_HORIZON = 12;

/** Per-channel acquisition economics within a cohort. CAC is that channel's own
 *  spend per signup; payback / LTV:CAC reuse the cohort-level LTV-per-user. */
export interface ChannelMetrics extends CohortChannel {
  /** spend / signups for this channel (CZK), 0 when the channel is free or empty */
  cac: number;
  /** whether the channel costs ad money (excluded from paid CAC when false) */
  paid: boolean;
  /** cohort LTV per user / channel CAC */
  ltvCac: number;
  /** 1-based month this channel's CAC is recovered, or null within horizon */
  paybackMonth: number | null;
}

export interface CohortMetrics extends Cohort {
  cac: number;
  /** retained months M3 (for the table) */
  m3: number;
  ltv: number;
  ltvCac: number;
  /** 1-based month the cumulative revenue/user covers CAC, or null within horizon */
  paybackMonth: number | null;
  /** paid-only CAC (excludes free/organic channels); equals `cac` when no breakdown */
  paidCac: number;
  /** per-channel economics when the cohort has a breakdown, else empty */
  channelMetrics: ChannelMetrics[];
}

export interface LtvSummary {
  signups: number;
  blendedCac: number;
  /** blended CAC over paid signups only (excludes free/organic) */
  paidCac: number;
  /** signups won through paid channels (excludes free/organic) */
  paidSignups: number;
  avgLtvCac: number;
  avgPayback: number | null;
}

/** Retention curve extended to `horizon` months by continuing the last observed
 *  month-over-month survival ratio (clamped to a sane band). */
function survivalCurve(retention: number[], horizon: number): number[] {
  const out = retention.slice(0, horizon);
  const n = retention.length;
  const ratio = n >= 2 ? Math.min(0.98, Math.max(0.8, retention[n - 1]! / retention[n - 2]!)) : 0.9;
  let last = retention[n - 1]!;
  for (let m = n; m < horizon; m++) {
    last *= ratio;
    out.push(last);
  }
  return out;
}

/** First 1-based month where cumulative revenue/user (from the survival curve)
 *  covers `cac`, or null if not recovered within the horizon. A free channel
 *  (cac === 0) pays back in month 1. */
function paybackOf(survival: number[], arpu: number, cac: number): number | null {
  let cum = 0;
  for (let m = 0; m < survival.length; m++) {
    cum += survival[m]! * arpu;
    if (cum >= cac) return m + 1;
  }
  return null;
}

export function withMetrics(c: Cohort): CohortMetrics {
  const cac = c.signups > 0 ? c.spend / c.signups : 0;
  const survival = survivalCurve(c.retention, LTV_HORIZON);
  const ltv = survival.reduce((a, s) => a + s * c.arpu, 0);
  const paybackMonth = paybackOf(survival, c.arpu, cac);

  // Per-channel economics: each channel's own spend/signups CAC, but the cohort's
  // shared LTV-per-user for payback and LTV:CAC.
  const channelMetrics: ChannelMetrics[] = (c.channels ?? []).map((ch) => {
    const chCac = ch.signups > 0 ? ch.spend / ch.signups : 0;
    const paid = isPaidChannel(ch.channel);
    return {
      ...ch,
      cac: chCac,
      paid,
      ltvCac: chCac > 0 ? ltv / chCac : 0,
      paybackMonth: paybackOf(survival, c.arpu, chCac),
    };
  });

  // Paid-only CAC: spend over paid signups, excluding free/organic channels.
  // With no breakdown, paid CAC degrades to the blended CAC (no regression).
  let paidCac = cac;
  if (channelMetrics.length > 0) {
    const paidSpend = channelMetrics.filter((m) => m.paid).reduce((a, m) => a + m.spend, 0);
    const paidSignups = channelMetrics.filter((m) => m.paid).reduce((a, m) => a + m.signups, 0);
    paidCac = paidSignups > 0 ? paidSpend / paidSignups : 0;
  }

  return {
    ...c,
    cac,
    m3: c.retention[3] ?? c.retention[c.retention.length - 1] ?? 0,
    ltv,
    ltvCac: cac > 0 ? ltv / cac : 0,
    paybackMonth,
    paidCac,
    channelMetrics,
  };
}

export function ltvSummary(cohorts: Cohort[]): LtvSummary {
  const rows = cohorts.map(withMetrics);
  const signups = rows.reduce((a, r) => a + r.signups, 0);
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const paybacks = rows.map((r) => r.paybackMonth).filter((p): p is number => p != null);

  // Blended paid CAC: total paid spend / total paid signups. A cohort without a
  // breakdown contributes its blended spend/signups as fully paid (today's
  // behavior), so the paid figure never regresses below blended for such data.
  let paidSpend = 0;
  let paidSignups = 0;
  for (const r of rows) {
    if (r.channelMetrics.length > 0) {
      for (const m of r.channelMetrics) {
        if (m.paid) {
          paidSpend += m.spend;
          paidSignups += m.signups;
        }
      }
    } else {
      paidSpend += r.spend;
      paidSignups += r.signups;
    }
  }

  return {
    signups,
    blendedCac: signups > 0 ? spend / signups : 0,
    paidCac: paidSignups > 0 ? paidSpend / paidSignups : 0,
    paidSignups,
    avgLtvCac: rows.length ? rows.reduce((a, r) => a + r.ltvCac, 0) / rows.length : 0,
    avgPayback: paybacks.length ? paybacks.reduce((a, p) => a + p, 0) / paybacks.length : null,
  };
}
