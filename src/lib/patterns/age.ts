/** How old a SAVED pattern is — display-only, pure, no clock at module scope (the
 *  caller passes `now`). A pin's `createdAt` was stored on save and never read; it
 *  is read here so the library can say how long a curated lesson has been sitting in
 *  the account, and — paired with the contradiction flag — whether a frozen pin has
 *  outlived the data that once backed it.
 *
 *  The age phrase mirrors the round-7 `formatMeasuredAge` / `formatVoiceAge`
 *  precedent bucket-for-bucket (days < 14 → days, < 60 → weeks, else months, with the
 *  Czech instrumental grammar after „před"), so every staleness surface reads the same. */

/** Whole days between an ISO timestamp and `now` (≥ 0; NaN if unparseable). */
export function patternAgeDays(iso: string, now: Date = new Date()): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return NaN;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** Locale-aware "před 3 měsíci / 3 months ago" for a pattern's save timestamp.
 *  Returns "" for an empty/unparseable stamp (auto patterns carry no createdAt), so
 *  the caller can omit the note. Mirrors `formatMeasuredAge`'s buckets + grammar. */
export function formatPatternAge(iso: string, locale: "cs" | "en", now: Date = new Date()): string {
  const days = patternAgeDays(iso, now);
  if (!Number.isFinite(days)) return "";
  const cs = locale === "cs";
  if (days < 1) return cs ? "dnes" : "today";

  let n: number;
  let unit: "day" | "week" | "month";
  if (days < 14) {
    n = days;
    unit = "day";
  } else if (days < 60) {
    n = Math.round(days / 7);
    unit = "week";
  } else {
    n = Math.round(days / 30);
    unit = "month";
  }

  if (cs) {
    const w =
      unit === "day"
        ? n === 1
          ? "dnem"
          : "dny"
        : unit === "week"
          ? n === 1
            ? "týdnem"
            : "týdny"
          : n === 1
            ? "měsícem"
            : "měsíci";
    return `před ${n} ${w}`;
  }
  const w = unit === "day" ? "day" : unit === "week" ? "week" : "month";
  return `${n} ${w}${n === 1 ? "" : "s"} ago`;
}
