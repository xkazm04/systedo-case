"use client";

import { useState } from "react";
import { LOCALES, createFormatters, type SupportedLocale } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { TDict } from "@/lib/i18n/interpolate";

/** Live proof that the formatting layer is locale-parameterised: the same values
 *  rendered through createFormatters(locale), switchable cs ⇄ en. Deterministic
 *  (fixed sample + fixed `now`) so the page stays a stable visual baseline. */

type Key =
  | "ariaLabel"
  | "rowCurrency"
  | "rowCurrencyCompact"
  | "rowCount"
  | "rowPercent"
  | "rowChange"
  | "rowMultiple"
  | "rowDate"
  | "rowRelative"
  | "footnoteLead"
  | "footnoteTail";

const T: TDict<Key> = {
  cs: {
    ariaLabel: "Výběr jazyka a měny",
    rowCurrency: "Měna",
    rowCurrencyCompact: "Měna kompaktně",
    rowCount: "Počet",
    rowPercent: "Procento",
    rowChange: "Změna (±)",
    rowMultiple: "Násobek",
    rowDate: "Datum",
    rowRelative: "Relativní čas",
    footnoteLead: "Stejná čísla přes jeden chokepoint",
    footnoteTail: "— přidání trhu je jediná položka v",
  },
  en: {
    ariaLabel: "Language and currency selector",
    rowCurrency: "Currency",
    rowCurrencyCompact: "Currency (compact)",
    rowCount: "Count",
    rowPercent: "Percent",
    rowChange: "Change (±)",
    rowMultiple: "Multiple",
    rowDate: "Date",
    rowRelative: "Relative time",
    footnoteLead: "Same numbers through one chokepoint",
    footnoteTail: "— adding a market is a single entry in",
  },
};

const SAMPLE = {
  big: 1248590,
  compact: 1640000,
  count: 12480,
  pct: 0.165,
  delta: 0.124,
  roas: 4.2,
  dateIso: "2026-05-14",
  relIso: "2026-06-12",
  now: "2026-06-15",
};

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  cs: "Česky · CZK",
  en: "English · USD",
};

export default function LocaleShowcase() {
  const [locale, setLocale] = useState<SupportedLocale>("cs");
  const t = useT(T);
  const f = createFormatters(locale);
  const now = new Date(`${SAMPLE.now}T00:00:00`);

  const rows: { label: string; code: string; value: string }[] = [
    { label: t("rowCurrency"), code: "fmtCZK", value: f.fmtCZK(SAMPLE.big) },
    { label: t("rowCurrencyCompact"), code: "fmtCZKCompact", value: f.fmtCZKCompact(SAMPLE.compact) },
    { label: t("rowCount"), code: "fmtInt", value: f.fmtInt(SAMPLE.count) },
    { label: t("rowPercent"), code: "fmtPct", value: f.fmtPct(SAMPLE.pct) },
    { label: t("rowChange"), code: "fmtSignedPct", value: f.fmtSignedPct(SAMPLE.delta) },
    { label: t("rowMultiple"), code: "fmtMultiple", value: f.fmtMultiple(SAMPLE.roas) },
    { label: t("rowDate"), code: "fmtDate", value: f.fmtDate(SAMPLE.dateIso) },
    { label: t("rowRelative"), code: "fmtRelative", value: f.fmtRelative(SAMPLE.relIso, now) },
  ];

  return (
    <div className="space-y-4">
      {/* A two-state value switch, not a WAI-ARIA tabs widget (no tabpanels /
          roving focus / arrow-key nav) — so it's a group of aria-pressed toggle
          buttons rather than role="tablist"/"tab", which would promise behaviour
          this control doesn't implement. */}
      <div
        role="group"
        aria-label={t("ariaLabel")}
        className="inline-flex rounded-pill border border-line bg-surface p-1"
      >
        {(Object.keys(LOCALES) as SupportedLocale[]).map((loc) => (
          <button
            key={loc}
            type="button"
            aria-pressed={locale === loc}
            onClick={() => setLocale(loc)}
            className={`rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
              locale === loc ? "bg-brand-700 text-white" : "text-muted hover:text-navy-700"
            }`}
          >
            {LOCALE_LABELS[loc]}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="px-5 py-3 text-navy-700">{r.label}</td>
                <td className="px-3 py-3">
                  <code className="rounded bg-navy-50 px-1.5 py-0.5 text-[14px] text-navy-700">
                    {r.code}
                  </code>
                </td>
                <td className="tnum px-5 py-3 text-right font-medium text-navy-800">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        {t("footnoteLead")}{" "}
        <code className="rounded bg-navy-50 px-1 py-0.5 text-navy-700">createFormatters(locale)</code>{" "}
        {t("footnoteTail")} <code className="rounded bg-navy-50 px-1 py-0.5 text-navy-700">LOCALES</code>.
      </p>
    </div>
  );
}
