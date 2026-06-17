"use client";

import { useState } from "react";
import { LOCALES, createFormatters, type SupportedLocale } from "@/lib/format";

/** Live proof that the formatting layer is locale-parameterised: the same values
 *  rendered through createFormatters(locale), switchable cs ⇄ en. Deterministic
 *  (fixed sample + fixed `now`) so the page stays a stable visual baseline. */

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
  const f = createFormatters(locale);
  const now = new Date(`${SAMPLE.now}T00:00:00`);

  const rows: { label: string; code: string; value: string }[] = [
    { label: "Měna", code: "fmtCZK", value: f.fmtCZK(SAMPLE.big) },
    { label: "Měna kompaktně", code: "fmtCZKCompact", value: f.fmtCZKCompact(SAMPLE.compact) },
    { label: "Počet", code: "fmtInt", value: f.fmtInt(SAMPLE.count) },
    { label: "Procento", code: "fmtPct", value: f.fmtPct(SAMPLE.pct) },
    { label: "Změna (±)", code: "fmtSignedPct", value: f.fmtSignedPct(SAMPLE.delta) },
    { label: "Násobek", code: "fmtMultiple", value: f.fmtMultiple(SAMPLE.roas) },
    { label: "Datum", code: "fmtDate", value: f.fmtDate(SAMPLE.dateIso) },
    { label: "Relativní čas", code: "fmtRelative", value: f.fmtRelative(SAMPLE.relIso, now) },
  ];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Výběr jazyka a měny"
        className="inline-flex rounded-pill border border-line bg-surface p-1"
      >
        {(Object.keys(LOCALES) as SupportedLocale[]).map((loc) => (
          <button
            key={loc}
            type="button"
            role="tab"
            aria-selected={locale === loc}
            onClick={() => setLocale(loc)}
            className={`rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
              locale === loc ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
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
        Stejná čísla přes jeden chokepoint{" "}
        <code className="rounded bg-navy-50 px-1 py-0.5 text-navy-700">createFormatters(locale)</code>{" "}
        — přidání trhu je jediná položka v <code className="rounded bg-navy-50 px-1 py-0.5 text-navy-700">LOCALES</code>.
      </p>
    </div>
  );
}
