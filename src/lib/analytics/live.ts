/** Live funnel rates: the thin server fetch that joins the first-party daily
 *  counters to the pure rollups in ./funnel (mirroring activity/publish-rate-live).
 *  No seed and no fallback — `ok: false` means the backend READ failed (an
 *  outage), which is distinct from an empty window (the rollups' own honest
 *  "no-data" status). Server-only. */
import "server-only";
import { listDailyMetricsSince } from "./store";
import {
  activationRollup,
  DEFAULT_FUNNEL_WINDOW_DAYS,
  signupConversionRollup,
  type FunnelRollup,
} from "./funnel";

export interface LiveFunnelRates {
  /** false only on a backend read FAILURE (never for an empty window). */
  ok: boolean;
  signup: FunnelRollup | null;
  activation: FunnelRollup | null;
}

const DAY_MS = 86_400_000;

export async function liveFunnelRates(
  windowDays = DEFAULT_FUNNEL_WINDOW_DAYS
): Promise<LiveFunnelRates> {
  const sinceDay = new Date(Date.now() - (windowDays - 1) * DAY_MS).toISOString().slice(0, 10);
  try {
    const rows = await listDailyMetricsSince(sinceDay);
    return {
      ok: true,
      signup: signupConversionRollup(rows, { windowDays }),
      activation: activationRollup(rows, { windowDays }),
    };
  } catch (err) {
    console.error("[analytics] funnel read failed:", err);
    return { ok: false, signup: null, activation: null };
  }
}
