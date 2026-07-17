/** Currency-label resolution for the synced money surfaces (pure, framework-free,
 *  unit-tested). The connector persists each account's real ISO currency on the sync
 *  meta (Google `customer.currency_code`; Sklik is always CZK). The dashboard does
 *  NOT convert — every stored amount is the account's NATIVE value — so this seam
 *  only decides which currency SYMBOL to render:
 *
 *    - a CZK (or unknown / un-captured) account → the app's base CZK formatting,
 *      BYTE-IDENTICAL to today (no regression for the overwhelmingly-common case and
 *      for older syncs written before currency capture existed);
 *    - a non-CZK account (e.g. a EUR or PLN Google Ads account) → the amount labelled
 *      in its OWN currency, so "1 234 €" never reads as "1 234 Kč".
 *
 *  Full multi-currency CONVERSION is an explicit non-goal — we relabel, never rescale. */

/** The app's base currency: amounts in it use the existing locale-bound formatting. */
export const BASE_CURRENCY = "CZK";

/** Normalise a wire currency code to a canonical ISO-4217 alpha-3, or null when it is
 *  absent / malformed (so a junk value degrades to the base, never throws). */
export function normalizeCurrency(code: string | null | undefined): string | null {
  if (typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

/** Is this account's currency the app's base (or unknown / un-captured)? Unknown
 *  counts as base so the labels stay exactly as they render today. */
export function isBaseCurrency(code: string | null | undefined): boolean {
  const c = normalizeCurrency(code);
  return c === null || c === BASE_CURRENCY;
}

/** Should the money surfaces flag a non-base currency? True only for a captured,
 *  well-formed, non-CZK code — the one case the UI adds a currency note for. */
export function isForeignCurrency(code: string | null | undefined): boolean {
  return !isBaseCurrency(code);
}

/**
 * Resolve the money formatter for a synced surface, given the account currency.
 *
 * For a base/unknown currency it returns `base` UNCHANGED (the locale's `fmtCZK`),
 * so CZK accounts are byte-identical everywhere. For a captured non-base currency it
 * builds an Intl currency formatter in that code + the given BCP-47 locale, matching
 * `fmtCZK`'s options (no fraction digits, non-finite → em dash) so only the symbol
 * differs. Pure: the same inputs always yield the same labels.
 */
export function resolveMoneyFormatter(opts: {
  currency: string | null | undefined;
  /** BCP-47 tag (e.g. "cs-CZ") — from LOCALES[locale].intlLocale. */
  intlLocale: string;
  /** the locale's own `fmtCZK`, returned as-is for base/unknown currencies. */
  base: (n: number) => string;
}): (n: number) => string {
  const code = normalizeCurrency(opts.currency);
  if (code === null || code === BASE_CURRENCY) return opts.base;
  const nf = new Intl.NumberFormat(opts.intlLocale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  });
  return (n: number) => (Number.isFinite(n) ? nf.format(n) : "—");
}

/**
 * The SIGNED counterpart of {@link resolveMoneyFormatter}, for money DELTAS ("+38 000 €",
 * "−1 200 €"). The signed money surfaces (projected gain/saving/profit, the change strip)
 * used a hard-coded `fmtSignedCZK`, so a foreign account saw its move amount relabelled in
 * its own currency while the gain on the same row stayed koruny.
 *
 * For a base/unknown currency it returns `base` UNCHANGED (the locale's `fmtSignedCZK`),
 * byte-identical for CZK tenants. For a captured non-base currency it builds an Intl
 * currency formatter and applies the SAME sign rule as `fmtSignedCZK`: round before
 * signing (so a sub-unit delta that displays as zero never carries a misleading sign),
 * a true minus U+2212, an explicit plus for gains, and the em-dash for non-finite. Pure.
 */
export function resolveSignedMoneyFormatter(opts: {
  currency: string | null | undefined;
  /** BCP-47 tag (e.g. "cs-CZ") — from LOCALES[locale].intlLocale. */
  intlLocale: string;
  /** the locale's own `fmtSignedCZK`, returned as-is for base/unknown currencies. */
  base: (n: number) => string;
}): (n: number) => string {
  const code = normalizeCurrency(opts.currency);
  if (code === null || code === BASE_CURRENCY) return opts.base;
  const nf = new Intl.NumberFormat(opts.intlLocale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  });
  return (n: number) => {
    if (!Number.isFinite(n)) return "—";
    const r = Math.round(n);
    const sign = r > 0 ? "+" : r < 0 ? "−" : "";
    return `${sign}${nf.format(Math.abs(r))}`;
  };
}
