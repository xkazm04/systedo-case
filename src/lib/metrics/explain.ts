/** Direction 1 — anomalies read the calendar. A pure, deterministic date-window
 *  join between the detected anomalies and the dataset's story-event calendar
 *  (`PerformanceData.events`). That calendar is the ONE canonical source of "what
 *  happened here": a sample dataset carries authored events, and a live report has
 *  its client annotations mapped into the SAME PerformanceEvent shape upstream
 *  (see `annotations/types.ts#annotationsToEvents` + `report-metrics/resolve.ts`),
 *  so this single join covers both the dataset's events and the project's notes.
 *
 *  An anomaly that falls inside an event's window is marked `explained` with the
 *  event's title. It is NEVER suppressed — the money impact still counts and the
 *  windfall/damage math is unchanged (see `anomalyImpact`); the flag only lets the
 *  surface render a calmer, "this was expected" line instead of an alarm. There is
 *  no fitted seasonality model here and detection thresholds are untouched — this
 *  is a labelling pass that runs AFTER detection. */

import type { PerformanceEvent } from "../types";
import type { Anomaly } from "./anomalies";

/** An anomaly, plus the title of the calendar event/annotation that explains it
 *  (absent when the date-window join found no candidate). All Anomaly fields are
 *  preserved unchanged. */
export interface ExplainedAnomaly extends Anomaly {
  /** title of the event/annotation whose window contains this flagged day, when a
   *  deterministic join matched one; absent = unexplained (renders as before). */
  explanation?: string;
}

/** The ± window (in days) applied to a POINT event — a single-date authored event
 *  or a client annotation, which pins one calendar day but whose real-world effect
 *  can land a day early or late (a promo that ships the evening before, an outage
 *  that spills past midnight). A range event (`days > 1`) uses its own span exactly
 *  and gets no extra padding, so its explanatory reach is precisely its duration. */
export const EXPLAIN_POINT_WINDOW_DAYS = 1;

/** UTC day-number for a YYYY-MM-DD calendar day (days since epoch). Pure integer
 *  arithmetic — the same UTC basis the rest of the engine (`dayOfWeek`) uses, so a
 *  join never drifts by a timezone. */
function dayNumber(ymd: string): number {
  return Math.floor(new Date(`${ymd}T00:00:00.000Z`).getTime() / 86_400_000);
}

/** The inclusive [start, end] day-number window an event explains. A range event
 *  (`days > 1`) spans [date, date + days − 1] with no padding; a point event
 *  (`days` absent or ≤ 1) is widened by ±`pointWindowDays`. */
function eventWindow(
  event: PerformanceEvent,
  pointWindowDays: number
): { start: number; end: number } {
  const first = dayNumber(event.date);
  const span = Math.max(1, Math.floor(event.days ?? 1));
  const last = first + span - 1;
  if (span > 1) return { start: first, end: last }; // range: exact span
  return { start: first - pointWindowDays, end: last + pointWindowDays }; // point: ±window
}

/**
 * Label each anomaly with the event that explains it, if any. Deterministic:
 *   - an anomaly matches an event when its day falls in the event's window
 *     (range = exact span; single-date event/annotation = ±`pointWindowDays`);
 *   - among multiple matching events the NEAREST wins (distance = 0 when the day
 *     is inside the event's core span, else the gap to the nearest span edge);
 *   - ties break to the FIRST such event in input order (events are consumed in
 *     the order the dataset lists them, which upstream sorts ascending by date).
 *
 * Returns a new array in the SAME order as `anomalies`, every field preserved,
 * with `explanation` set on the matched ones. Pure — no dates mutated, no I/O.
 */
export function explainAnomalies(
  anomalies: Anomaly[],
  events: PerformanceEvent[] | undefined,
  pointWindowDays: number = EXPLAIN_POINT_WINDOW_DAYS
): ExplainedAnomaly[] {
  if (!events || events.length === 0) {
    return anomalies.map((a) => ({ ...a }));
  }
  const windows = events.map((e) => ({ event: e, ...eventWindow(e, pointWindowDays) }));
  return anomalies.map((a) => {
    const day = dayNumber(a.date);
    let best: { title: string; distance: number } | null = null;
    for (const w of windows) {
      if (day < w.start || day > w.end) continue; // outside this event's window
      // Distance to the event's CORE span (the padded edges read distance 0 too,
      // but a day sitting inside a real range beats a neighbouring point event).
      const coreStart = dayNumber(w.event.date);
      const coreEnd = coreStart + Math.max(1, Math.floor(w.event.days ?? 1)) - 1;
      const distance = day < coreStart ? coreStart - day : day > coreEnd ? day - coreEnd : 0;
      // Strictly-less keeps the FIRST event on a tie (input order = date order).
      if (best === null || distance < best.distance) {
        best = { title: w.event.label, distance };
      }
    }
    return best ? { ...a, explanation: best.title } : { ...a };
  });
}
