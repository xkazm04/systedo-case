"use client";

/** The portfolio KPI badges, minimized into the module page's header slot
 *  (opposite the title) via a portal, with an in-flow fallback if that slot never
 *  commits so the totals can never vanish silently.
 *
 *  ADR-0010: a project whose per-account tenants are billed in DIFFERENT
 *  currencies gets per-network totals instead. Cost, conversion value — and the
 *  ROAS/PNO derived from them — are all sums across accounts, and the sync
 *  converts nothing, so one portfolio figure over a CZK and a EUR account would be
 *  a fabricated number. We show each network's own money in its own currency and
 *  never a total that does not exist. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TARGET_PNO, aggregate, type Campaign } from "@/lib/campaigns/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { SourceTotals } from "./SourceSections";
import type { CampaignsSourceMeta } from "./campaigns-state";

const T = {
  cs: {
    kpiCost: "Náklady",
    kpiConvValue: "Hodnota konverzí",
    kpiPnoHint: "cíl {target} · placené portfolio",
  },
  en: {
    kpiCost: "Cost",
    kpiConvValue: "Conversion value",
    kpiPnoHint: "target {target} · paid portfolio",
  },
} as const;

export default function HeaderKpis({
  campaigns,
  fmtMoney,
  sources,
  mixedCurrency,
}: {
  campaigns: Campaign[];
  /** currency-aware money formatter for the single-currency case */
  fmtMoney: (n: number) => string;
  /** the union read's sections — present only for a multi-tenant project */
  sources?: CampaignsSourceMeta[];
  mixedCurrency?: boolean;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  // Portal host for the header badges (rendered into ModulePage's header slot,
  // opposite the title). Resolved after mount so the target div exists in the DOM.
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);
  // When the header slot never commits (a Suspense/streaming boundary, a layout
  // refactor, or a page that reuses this component without the slot) fall back to
  // rendering the KPI badges in-flow instead of losing them silently.
  const [inlineKpiFallback, setInlineKpiFallback] = useState(false);
  useEffect(() => {
    const slotId = "module-header-actions";
    // Try to bind the portal host; returns whether the slot was found.
    const resolveHost = (): boolean => {
      const el = document.getElementById(slotId);
      if (el) {
        setHeaderHost(el);
        setInlineKpiFallback(false);
      }
      return Boolean(el);
    };
    if (resolveHost()) return;
    // Not committed on this frame — watch the DOM for it rather than giving up
    // after a single query, and only fall back (+ warn in dev) if it truly never
    // appears, so the common case never flashes an in-flow row.
    const obs = new MutationObserver(() => {
      if (resolveHost()) {
        obs.disconnect();
        clearTimeout(timer);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      if (!document.getElementById(slotId)) {
        setInlineKpiFallback(true);
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[CampaignsClient] header slot #${slotId} never appeared — KPI badges render in-flow.`);
        }
      }
    }, 3000);
    return () => {
      obs.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // Never sum across currencies: per-network totals instead of a portfolio roll-up.
  if (mixedCurrency && sources) {
    return <SourceTotals campaigns={campaigns} sources={sources} />;
  }

  const totals = aggregate(campaigns);
  const kpis = [
    { label: t("kpiCost"), value: fmtMoney(totals.cost) },
    { label: t("kpiConvValue"), value: fmtMoney(totals.conversionValue) },
    { label: "ROAS", value: fmt.fmtMultiple(totals.roas) },
    { label: "PNO", value: fmt.fmtPct(totals.pno), hint: t("kpiPnoHint", { target: fmt.fmtPct(TARGET_PNO, 0) }) },
  ];
  const badges = kpis.map((k) => (
    <span
      key={k.label}
      title={k.hint}
      className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-xs"
    >
      <span className="text-muted">{k.label}</span>
      <span className="tnum font-semibold text-navy-800">{k.value}</span>
    </span>
  ));
  if (headerHost) return createPortal(<>{badges}</>, headerHost);
  if (inlineKpiFallback) return <div className="flex flex-wrap gap-2">{badges}</div>;
  return null;
}
