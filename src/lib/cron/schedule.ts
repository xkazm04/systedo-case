/** Pure scheduling helpers for the crons — framework-free, firebase-free, no I/O,
 *  so the double-run guard decisions are unit-testable in isolation. */

/** A Monday-anchored weekly key (UTC): the YYYY-MM-DD of the Monday of `date`'s
 *  week. Every run within the same ISO week maps to the same string, so the
 *  digest's weekly sent-guard blocks a manual re-fire anywhere in the week — not
 *  merely a same-day one. The weekly digest cron itself fires Monday 07:00 UTC. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const toMonday = day === 0 ? -6 : 1 - day; // shift Sun back 6, else back to Monday
  d.setUTCDate(d.getUTCDate() + toMonday);
  return d.toISOString().slice(0, 10);
}

/** The claim-first decision behind the sent-guard: a period is newly claimable
 *  only when it differs from the previously-recorded one. Both backends (the
 *  Firestore transaction and the sqlite UPSERT-where) enforce exactly this. */
export function isNewPeriod(previousPeriod: string | undefined | null, period: string): boolean {
  return previousPeriod !== period;
}
