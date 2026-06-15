/** Czech-locale formatting helpers. Centralised so every page renders numbers
 *  identically ("1 234 567 Kč", "16,5 %", "12,4 tis."). */

const LOCALE = "cs-CZ";

export const fmtInt = (n: number): string =>
  new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(Math.round(n));

export const fmtDecimal = (n: number, digits = 1): string =>
  new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);

export const fmtCZK = (n: number): string =>
  new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(n);

/** Compact currency for tight spaces: "1,6 mil. Kč", "248 tis. Kč". */
export const fmtCZKCompact = (n: number): string =>
  new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "CZK",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

export const fmtCompact = (n: number): string =>
  new Intl.NumberFormat(LOCALE, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

/** Accepts a fraction (0.165) and renders a percent ("16,5 %"). */
export const fmtPct = (fraction: number, digits = 1): string =>
  new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fraction);

/** Signed percent for deltas ("+12,4 %", "−3,1 %"). Uses a true minus sign. */
export const fmtSignedPct = (fraction: number, digits = 1): string => {
  const sign = fraction > 0 ? "+" : fraction < 0 ? "−" : "";
  return `${sign}${fmtPct(Math.abs(fraction), digits)}`;
};

/** Signed integer for score / count deltas ("+12", "−5", "0"). True minus sign. */
export const fmtSignedInt = (n: number): string => {
  const r = Math.round(n);
  const sign = r > 0 ? "+" : r < 0 ? "−" : "";
  return `${sign}${fmtInt(Math.abs(r))}`;
};

export const fmtMultiple = (n: number, digits = 1): string =>
  `${fmtDecimal(n, digits)}×`;

export const fmtDate = (iso: string): string =>
  new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));

export const fmtDateShort = (iso: string): string =>
  new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "numeric" }).format(
    new Date(`${iso}T00:00:00`)
  );

export const fmtMonth = (iso: string): string =>
  new Intl.DateTimeFormat(LOCALE, { month: "short", year: "2-digit" }).format(
    new Date(`${iso}T00:00:00`)
  );

/** Full month name + year, nominative ("květen 2026"). For period headings
 *  where the genitive `fmtDate` ("31. května 2026") would read wrong. */
export const fmtMonthLong = (iso: string): string =>
  new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" }).format(
    new Date(`${iso}T00:00:00`)
  );

/** Absolute date + time ("15. června 2026, 14:15"). Pairs with `fmtRelative`
 *  as the precise value behind a relative label (tooltip / aria-label). */
export const fmtDateTime = (iso: string): string =>
  new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const RANGE_PARTS = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Split a date into its day / month-name / year pieces (genitive month, as in
 *  "1. května"). Intl's own `formatRange` for cs-CZ falls back to a numeric month
 *  ("1.–31. 5. 2026"), so we compose the label ourselves to keep the month name. */
const rangeParts = (d: Date): { day: string; month: string; year: string } => {
  const parts = RANGE_PARTS.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
};

/** Collapses a date range into a compact Czech period label, sharing the month
 *  and year where possible ("1.–31. května 2026", "28. dubna – 4. května 2026",
 *  "28. prosince 2025 – 4. ledna 2026"). Accepts date-only ISO strings. */
export const fmtRange = (fromIso: string, toIso: string): string => {
  const a = rangeParts(new Date(`${fromIso}T00:00:00`));
  const b = rangeParts(new Date(`${toIso}T00:00:00`));
  if (a.year === b.year && a.month === b.month) {
    return a.day === b.day
      ? `${b.day}. ${b.month} ${b.year}` // single day — no range
      : `${a.day}.–${b.day}. ${b.month} ${b.year}`;
  }
  if (a.year === b.year) {
    return `${a.day}. ${a.month} – ${b.day}. ${b.month} ${b.year}`;
  }
  return `${a.day}. ${a.month} ${a.year} – ${b.day}. ${b.month} ${b.year}`;
};

// ---------------------------------------------------------------------------
// Relative time — "před 3 dny", "včera", "za 2 týdny". A recency/trust signal
// for sync timestamps and generated reports, kept here so it reads consistently
// with the number formats above. `numeric: "auto"` yields the idiomatic
// "včera" / "dnes" / "zítra" near the day boundary instead of "před 1 dnem".
// ---------------------------------------------------------------------------

const RELATIVE = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/** Cascading thresholds: keep dividing the elapsed seconds until it fits a unit. */
const RELATIVE_DIVISIONS: [limit: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.34524, "week"],
  [12, "month"],
];

/** Relative time in Czech ("před 3 dny", "včera", "za 2 týdny"). Accepts a full
 *  ISO timestamp ("2026-06-15T14:15:00Z") or a date-only string ("2026-06-15"),
 *  compared against `now` (injectable for testing). Negative = past, positive =
 *  future. */
export const fmtRelative = (iso: string, now: Date = new Date()): string => {
  const then = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  let value = (then.getTime() - now.getTime()) / 1000; // signed seconds
  for (const [limit, unit] of RELATIVE_DIVISIONS) {
    if (Math.abs(value) < limit) return RELATIVE.format(Math.round(value), unit);
    value /= limit;
  }
  return RELATIVE.format(Math.round(value), "year");
};

// ---------------------------------------------------------------------------
// Accessibility — compact notation ("1,6 mil. Kč", "12,4 tis.") is ambiguous to
// screen readers, so we pair the tight visual with the full value in an
// aria-label. Render as: <span aria-label={x.label}>{x.text}</span>, and the
// reader announces "1 600 000 Kč" ("jeden milion šest set tisíc korun").
// ---------------------------------------------------------------------------

export interface CompactA11y {
  /** Abbreviated text for the visual layout ("1,6 mil. Kč"). */
  text: string;
  /** Full, unabbreviated value for assistive tech ("1 600 000 Kč"). */
  label: string;
}

/** Compact currency paired with its full value, so screen readers announce the
 *  whole amount instead of the abbreviated "1,6 mil. Kč". */
export const fmtCZKCompactA11y = (n: number): CompactA11y => ({
  text: fmtCZKCompact(n),
  label: fmtCZK(n),
});

/** Compact number paired with its full value ("12,4 tis." ↔ "12 400"). */
export const fmtCompactA11y = (n: number): CompactA11y => ({
  text: fmtCompact(n),
  label: fmtInt(n),
});
