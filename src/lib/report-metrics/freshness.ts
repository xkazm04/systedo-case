/** Pure freshness decisions for the report's live metrics — extracted so the cron's
 *  "should I re-sync this project now?" gate, the report's "is this data stale?"
 *  banner and the recap's staleness caveat all derive from ONE rule, unit-testable
 *  without a store, a clock or Next. Framework-free (import from anywhere). */
import type { SupportedLocale } from "@/lib/format";

/** Below this age the cron does NOT re-sync (quota-safe): the hourly sync cron would
 *  otherwise re-pull the 400-day account series every run. ~20h makes a re-sync
 *  effectively once-a-day per project while tolerating cron jitter — a hard 24h gate
 *  would skip a whole day whenever a run drifts a few minutes late. */
export const RESYNC_MIN_HOURS = 20;

/** Past this age the displayed numbers are called out as stale (report banner + recap
 *  caveat): a monthly report a week behind its account is materially misleading. */
export const STALE_AFTER_DAYS = 7;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** ms since `syncedAt`, or null when it is missing / unparseable (treated as
 *  "unknown age"). A future timestamp yields a negative number (a clock skew), which
 *  the callers below read as "recent enough" — never as stale, never as due. */
function ageMs(syncedAt: string | undefined | null, now: Date): number | null {
  if (!syncedAt) return null;
  const t = Date.parse(syncedAt);
  if (Number.isNaN(t)) return null;
  return now.getTime() - t;
}

/** Should the cron re-sync this project's report metrics now? True when it has never
 *  synced (no/garbage timestamp → the linked project has no live series yet) OR the
 *  last sync is at least `minHours` old. A future timestamp (clock skew) → NOT due,
 *  so a skewed clock never thrashes the Ads API. */
export function isResyncDue(
  syncedAt: string | undefined | null,
  now: Date,
  minHours = RESYNC_MIN_HOURS
): boolean {
  const age = ageMs(syncedAt, now);
  if (age === null) return true; // never synced (or unknown) → let the caller sync
  return age >= minHours * HOUR_MS;
}

/** Is the synced series stale enough to warn about? False when never synced (the
 *  report is honestly on sample data — a different state, not "stale live data") and
 *  false for a future timestamp. */
export function isReportStale(
  syncedAt: string | undefined | null,
  now: Date,
  staleDays = STALE_AFTER_DAYS
): boolean {
  const age = ageMs(syncedAt, now);
  if (age === null) return false;
  return age >= staleDays * DAY_MS;
}

/** Whole days since the last sync (floored), or null when unknown — for caveat text. */
export function daysSinceSync(syncedAt: string | undefined | null, now: Date): number | null {
  const age = ageMs(syncedAt, now);
  return age === null || age < 0 ? null : Math.floor(age / DAY_MS);
}

/** One grounding line the recap injects (USER prompt only — no system-prompt /
 *  fingerprint change) when the live series is stale, so the AI narrative openly
 *  acknowledges the data age instead of presenting month-old numbers as current.
 *  "" when the data isn't stale, so the ungrounded/fresh prompt stays byte-identical. */
export function staleCaveatText(
  syncedAt: string | undefined | null,
  now: Date,
  locale: SupportedLocale
): string {
  if (!isReportStale(syncedAt, now)) return "";
  const days = daysSinceSync(syncedAt, now);
  const d = days ?? STALE_AFTER_DAYS;
  return locale === "en"
    ? `Caveat: this live data was last synced ${d} days ago and may be out of date — say so in the summary and read the figures as indicative, not real-time.`
    : `Upozornění: tato živá data byla naposledy synchronizována před ${d} dny a nemusí být aktuální — zmiň to v souhrnu a ber čísla jako orientační, ne aktuální.`;
}
