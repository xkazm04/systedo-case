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
