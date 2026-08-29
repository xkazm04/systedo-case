"use client";

/** ADR-0010 — the two surfaces a UNION read adds to the console:
 *   - {@link SourceProvenanceList}: one line per network inside the provenance
 *     popover ("Google Ads · živá data · 12 kampaní · před 2 h"), plus the
 *     mixed-currency note.
 *   - {@link SourceTotals}: per-source money totals, shown INSTEAD of a portfolio
 *     sum when the sections are billed in different currencies — the sync converts
 *     nothing, so a single "Náklady" figure across a CZK and a EUR account would be
 *     a fabricated number.
 *
 *  Both render only for a project that actually resolved to more than one tenant;
 *  a single-network console never mounts them. */
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { LOCALES } from "@/lib/format";
import { resolveMoneyFormatter } from "@/lib/campaigns/currency";
import { aggregate, type Campaign } from "@/lib/campaigns/types";
import type { CampaignsSourceMeta } from "./campaigns-state";

const T = {
  cs: {
    "google-ads": "Google Ads",
    sklik: "Sklik",
    sample: "Ukázka",
    heading: "Reklamní sítě",
    live: "živá data",
    sample_: "ukázková data",
    campaigns: "{n} kampaní",
    neverSynced: "nesynchronizováno",
    mixedTitle: "Různé měny účtů",
    mixedBody:
      "Účty jsou vedené v různých měnách. Nic nepřepočítáváme, takže portfolio nesčítáme — níže jsou součty za každou síť zvlášť a graf ukazuje jen primární síť.",
    collisions: "{n} kampaní se stejným ID přebito primární sítí",
    totalCost: "Náklady",
    totalValue: "Hodnota konverzí",
  },
  en: {
    "google-ads": "Google Ads",
    sklik: "Sklik",
    sample: "Sample",
    heading: "Ad networks",
    live: "live data",
    sample_: "sample data",
    campaigns: "{n} campaigns",
    neverSynced: "not synced",
    mixedTitle: "Accounts in different currencies",
    mixedBody:
      "These accounts are billed in different currencies. Nothing is converted, so the portfolio is not summed — totals are shown per network below and the chart shows the primary network only.",
    collisions: "{n} campaigns with a duplicate id were superseded by the primary network",
    totalCost: "Cost",
    totalValue: "Conversion value",
  },
} as const;

type LabelKey = "google-ads" | "sklik" | "sample";

function labelKey(source: CampaignsSourceMeta["source"]): LabelKey {
  return source === "sklik" ? "sklik" : source === "google-ads" ? "google-ads" : "sample";
}

/** One line per network in the provenance popover. */
export function SourceProvenanceList({
  sources,
  mixedCurrency,
}: {
  sources: CampaignsSourceMeta[];
  mixedCurrency?: boolean;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  return (
    <div className="mt-2">
      <p className="px-1 text-xs font-semibold text-ink">{t("heading")}</p>
      <ul className="mt-1 space-y-1">
        {sources.map((s, i) => {
          const isLive = Boolean(s.meta) && !s.meta?.degraded && s.meta?.source !== "sample";
          return (
            <li
              key={`${s.source}-${i}`}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-1.5"
            >
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-positive" : "bg-muted"}`}
                />
                {t(labelKey(s.source))}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span>{isLive ? t("live") : t("sample_")}</span>
                <span aria-hidden>·</span>
                <span className="tnum">{t("campaigns", { n: s.campaigns })}</span>
                <span aria-hidden>·</span>
                {s.meta?.syncedAt ? (
                  <time dateTime={s.meta.syncedAt} title={fmt.fmtDateTime(s.meta.syncedAt)}>
                    {fmt.fmtRelative(s.meta.syncedAt)}
                  </time>
                ) : (
                  <span>{t("neverSynced")}</span>
                )}
              </span>
              {Boolean(s.collisions) && (
                <span className="w-full text-[11px] text-coral-600">
                  {t("collisions", { n: s.collisions ?? 0 })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {mixedCurrency && (
        <div className="mt-1.5 rounded-lg border border-coral-400/40 bg-coral-soft px-3 py-2">
          <p className="text-xs font-medium text-coral-600">{t("mixedTitle")}</p>
          <p className="mt-1 text-[11px] text-muted">{t("mixedBody")}</p>
        </div>
      )}
    </div>
  );
}

/** Per-network money totals, each labelled in its OWN account currency. */
export function SourceTotals({
  campaigns,
  sources,
}: {
  campaigns: Campaign[];
  sources: CampaignsSourceMeta[];
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const { locale } = useLocale();
  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((s, i) => {
        const totals = aggregate(campaigns.filter((c) => c.source === s.source));
        const money = resolveMoneyFormatter({
          currency: s.currency ?? s.meta?.currency,
          intlLocale: LOCALES[locale].intlLocale,
          base: fmt.fmtCZK,
        });
        return (
          <div
            key={`${s.source}-${i}`}
            className="rounded-card border border-line bg-surface px-3 py-2 text-xs"
          >
            <p className="font-semibold text-ink">{t(labelKey(s.source))}</p>
            <p className="mt-1 flex items-center gap-2 text-muted">
              <span>{t("totalCost")}</span>
              <span className="tnum font-medium text-ink">{money(totals.cost)}</span>
            </p>
            <p className="flex items-center gap-2 text-muted">
              <span>{t("totalValue")}</span>
              <span className="tnum font-medium text-ink">{money(totals.conversionValue)}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
