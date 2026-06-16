/** Number / date / currency formatting, parameterised by locale so the whole
 *  product can render for another market by switching one config — yet every
 *  existing call site keeps importing the same `fmtCZK`, `fmtPct`, … which are a
 *  default Czech (cs-CZ / CZK) instance of the factory below. Centralised so every
 *  page renders numbers identically ("1 234 567 Kč", "16,5 %", "12,4 tis."). */

export type SupportedLocale = "cs" | "en";

interface LocaleConfig {
  /** BCP-47 tag passed to Intl */
  intlLocale: string;
  /** ISO 4217 currency code */
  currency: string;
}

/** The markets the app can render. Adding one is a single entry here; every
 *  `fmt*` produced by `createFormatters` then speaks that locale + currency. */
export const LOCALES: Record<SupportedLocale, LocaleConfig> = {
  cs: { intlLocale: "cs-CZ", currency: "CZK" },
  en: { intlLocale: "en-US", currency: "USD" },
};

export const DEFAULT_LOCALE: SupportedLocale = "cs";

export interface CompactA11y {
  /** Abbreviated text for the visual layout ("1,6 mil. Kč"). */
  text: string;
  /** Full, unabbreviated value for assistive tech ("1 600 000 Kč"). */
  label: string;
}

export interface Formatters {
  fmtInt: (n: number) => string;
  fmtDecimal: (n: number, digits?: number) => string;
  /** Currency in the active locale (named `fmtCZK` for call-site compatibility). */
  fmtCZK: (n: number) => string;
  fmtCZKCompact: (n: number) => string;
  fmtCompact: (n: number) => string;
  fmtPct: (fraction: number, digits?: number) => string;
  fmtSignedPct: (fraction: number, digits?: number) => string;
  fmtSignedInt: (n: number) => string;
  fmtMultiple: (n: number, digits?: number) => string;
  fmtDate: (iso: string) => string;
  fmtDateShort: (iso: string) => string;
  fmtMonth: (iso: string) => string;
  fmtMonthLong: (iso: string) => string;
  fmtDateTime: (iso: string) => string;
  fmtRange: (fromIso: string, toIso: string) => string;
  fmtRelative: (iso: string, now?: Date) => string;
  fmtCZKCompactA11y: (n: number) => CompactA11y;
  fmtCompactA11y: (n: number) => CompactA11y;
}

/** Cascading thresholds: keep dividing the elapsed seconds until it fits a unit. */
const RELATIVE_DIVISIONS: [limit: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.34524, "week"],
  [12, "month"],
];

/** Build a full set of formatters bound to one locale + currency. */
export function createFormatters(locale: SupportedLocale = DEFAULT_LOCALE): Formatters {
  const { intlLocale, currency } = LOCALES[locale];

  // Em-dash placeholder for non-finite numbers / unparseable dates, so one
  // malformed LLM-sourced or user-entered field renders "—" instead of
  // "NaN Kč" / "Invalid Date" leaking into the UI and AI prompts.
  const DASH = "—";

  const fmtInt = (n: number): string =>
    Number.isFinite(n)
      ? new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 }).format(Math.round(n))
      : DASH;

  const fmtDecimal = (n: number, digits = 1): string =>
    Number.isFinite(n)
      ? new Intl.NumberFormat(intlLocale, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(n)
      : DASH;

  const fmtCZK = (n: number): string =>
    Number.isFinite(n)
      ? new Intl.NumberFormat(intlLocale, {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(n)
      : DASH;

  const fmtCZKCompact = (n: number): string =>
    Number.isFinite(n)
      ? new Intl.NumberFormat(intlLocale, {
          style: "currency",
          currency,
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(n)
      : DASH;

  const fmtCompact = (n: number): string =>
    Number.isFinite(n)
      ? new Intl.NumberFormat(intlLocale, {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(n)
      : DASH;

  /** Accepts a fraction (0.165) and renders a percent ("16,5 %"). */
  const fmtPct = (fraction: number, digits = 1): string =>
    Number.isFinite(fraction)
      ? new Intl.NumberFormat(intlLocale, {
          style: "percent",
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(fraction)
      : DASH;

  /** Signed percent for deltas ("+12,4 %", "−3,1 %"). Uses a true minus sign. */
  const fmtSignedPct = (fraction: number, digits = 1): string => {
    const sign = fraction > 0 ? "+" : fraction < 0 ? "−" : "";
    return `${sign}${fmtPct(Math.abs(fraction), digits)}`;
  };

  /** Signed integer for score / count deltas ("+12", "−5", "0"). True minus sign. */
  const fmtSignedInt = (n: number): string => {
    const r = Math.round(n);
    const sign = r > 0 ? "+" : r < 0 ? "−" : "";
    return `${sign}${fmtInt(Math.abs(r))}`;
  };

  const fmtMultiple = (n: number, digits = 1): string =>
    Number.isFinite(n) ? `${fmtDecimal(n, digits)}×` : DASH;

  /** Parse an ISO date or timestamp, returning null for an unparseable value. */
  const parseDate = (iso: string): Date | null => {
    const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const fmtDate = (iso: string): string => {
    const d = parseDate(iso);
    return d
      ? new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", year: "numeric" }).format(d)
      : DASH;
  };

  const fmtDateShort = (iso: string): string => {
    const d = parseDate(iso);
    return d
      ? new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "numeric" }).format(d)
      : DASH;
  };

  const fmtMonth = (iso: string): string => {
    const d = parseDate(iso);
    return d
      ? new Intl.DateTimeFormat(intlLocale, { month: "short", year: "2-digit" }).format(d)
      : DASH;
  };

  /** Full month name + year, nominative ("květen 2026"). For period headings
   *  where the genitive `fmtDate` ("31. května 2026") would read wrong. */
  const fmtMonthLong = (iso: string): string => {
    const d = parseDate(iso);
    return d
      ? new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" }).format(d)
      : DASH;
  };

  /** Absolute date + time ("15. června 2026, 14:15"). Pairs with `fmtRelative`
   *  as the precise value behind a relative label (tooltip / aria-label). */
  const fmtDateTime = (iso: string): string => {
    const d = parseDate(iso);
    return d
      ? new Intl.DateTimeFormat(intlLocale, {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(d)
      : DASH;
  };

  const RANGE_PARTS = new Intl.DateTimeFormat(intlLocale, {
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

  /** Collapses a date range into a compact period label, sharing the month and
   *  year where possible ("1.–31. května 2026", "28. dubna – 4. května 2026"). */
  const fmtRange = (fromIso: string, toIso: string): string => {
    const da = parseDate(fromIso);
    const db = parseDate(toIso);
    if (!da || !db) return DASH;
    const a = rangeParts(da);
    const b = rangeParts(db);
    if (a.year === b.year && a.month === b.month) {
      return a.day === b.day
        ? `${b.day}. ${b.month} ${b.year}`
        : `${a.day}.–${b.day}. ${b.month} ${b.year}`;
    }
    if (a.year === b.year) {
      return `${a.day}. ${a.month} – ${b.day}. ${b.month} ${b.year}`;
    }
    return `${a.day}. ${a.month} ${a.year} – ${b.day}. ${b.month} ${b.year}`;
  };

  const RELATIVE = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });

  /** Relative time ("před 3 dny", "včera", "za 2 týdny"). Accepts a full ISO
   *  timestamp or a date-only string, compared against `now` (injectable). */
  const fmtRelative = (iso: string, now: Date = new Date()): string => {
    const then = parseDate(iso);
    if (!then) return DASH;
    let value = (then.getTime() - now.getTime()) / 1000;
    for (const [limit, unit] of RELATIVE_DIVISIONS) {
      if (Math.abs(value) < limit) return RELATIVE.format(Math.round(value), unit);
      value /= limit;
    }
    return RELATIVE.format(Math.round(value), "year");
  };

  /** Compact currency paired with its full value, so screen readers announce the
   *  whole amount instead of the abbreviated "1,6 mil. Kč". */
  const fmtCZKCompactA11y = (n: number): CompactA11y => ({
    text: fmtCZKCompact(n),
    label: fmtCZK(n),
  });

  /** Compact number paired with its full value ("12,4 tis." ↔ "12 400"). */
  const fmtCompactA11y = (n: number): CompactA11y => ({
    text: fmtCompact(n),
    label: fmtInt(n),
  });

  return {
    fmtInt,
    fmtDecimal,
    fmtCZK,
    fmtCZKCompact,
    fmtCompact,
    fmtPct,
    fmtSignedPct,
    fmtSignedInt,
    fmtMultiple,
    fmtDate,
    fmtDateShort,
    fmtMonth,
    fmtMonthLong,
    fmtDateTime,
    fmtRange,
    fmtRelative,
    fmtCZKCompactA11y,
    fmtCompactA11y,
  };
}

// Default Czech (cs-CZ / CZK) instance — preserves every existing named export so
// all ~199 call sites and the AI prompt builders keep working unchanged.
const cs = createFormatters(DEFAULT_LOCALE);

export const {
  fmtInt,
  fmtDecimal,
  fmtCZK,
  fmtCZKCompact,
  fmtCompact,
  fmtPct,
  fmtSignedPct,
  fmtSignedInt,
  fmtMultiple,
  fmtDate,
  fmtDateShort,
  fmtMonth,
  fmtMonthLong,
  fmtDateTime,
  fmtRange,
  fmtRelative,
  fmtCZKCompactA11y,
  fmtCompactA11y,
} = cs;
