"use client";

/** D1 — Robert's weekly job spans marketing + LTV + stock, but the report was a
 *  single-period performance recap. These two compact cards compose the /ltv and
 *  /sklad-sezonnost spines into the report (headline numbers + a link to the full
 *  module), so the report is the one-stop view that replaces his reconciliation. */
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { useT, useFormatters } from "@/lib/i18n/client";

export interface ReportBeyondData {
  ltvCac: number;
  payback: number | null;
  paidCac: number;
  atRiskCount: number;
  seasonIndex: number;
  seasonLabel: string;
}

const T = {
  cs: {
    heading: "Nad rámec období",
    sub: "Ekonomika zákazníka a sklad — abyste týden nezavírali ve třech nástrojích.",
    ltvTitle: "Zákazník: CAC → LTV",
    ltvCac: "LTV : CAC",
    payback: "Návratnost CAC",
    paidCac: "Placený CAC",
    months: "{n} měs.",
    noPayback: "—",
    open: "Otevřít",
    stockTitle: "Sklad & sezónnost",
    atRisk: "SKU v riziku",
    atRiskNone: "Sklad bez rizika",
    season: "Sezónnost ({month})",
    seasonHint: "1,0× = průměr",
  },
  en: {
    heading: "Beyond this period",
    sub: "Customer economics and stock — so you don't close the week in three tools.",
    ltvTitle: "Customer: CAC → LTV",
    ltvCac: "LTV : CAC",
    payback: "CAC payback",
    paidCac: "Paid CAC",
    months: "{n} mo",
    noPayback: "—",
    open: "Open",
    stockTitle: "Stock & seasonality",
    atRisk: "SKUs at risk",
    atRiskNone: "Stock healthy",
    season: "Seasonality ({month})",
    seasonHint: "1.0× = average",
  },
} as const;

export default function ReportBeyond({ projectId, data }: { projectId: string; data: ReportBeyondData }) {
  const t = useT(T);
  const { fmtMultiple, fmtCZK } = useFormatters();

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-navy-800">{t("heading")}</h3>
        <p className="mt-0.5 text-xs text-muted">{t("sub")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* LTV / cohorts */}
        <Link
          href={`/app/${projectId}/ltv`}
          className="group rounded-lg border border-line bg-canvas p-4 transition-colors hover:border-brand-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("ltvTitle")}</span>
            <ArrowRight width={14} height={14} className="text-muted transition-colors group-hover:text-brand-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-4">
            <Stat label={t("ltvCac")} value={`${fmtMultiple(data.ltvCac)}`} />
            <Stat label={t("payback")} value={data.payback != null ? t("months", { n: Math.round(data.payback) }) : t("noPayback")} />
            <Stat label={t("paidCac")} value={fmtCZK(data.paidCac)} />
          </div>
        </Link>

        {/* Stock & seasonality */}
        <Link
          href={`/app/${projectId}/sklad-sezonnost`}
          className="group rounded-lg border border-line bg-canvas p-4 transition-colors hover:border-brand-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("stockTitle")}</span>
            <ArrowRight width={14} height={14} className="text-muted transition-colors group-hover:text-brand-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-4">
            <Stat
              label={data.atRiskCount > 0 ? t("atRisk") : t("atRiskNone")}
              value={data.atRiskCount > 0 ? String(data.atRiskCount) : "✓"}
              tone={data.atRiskCount > 0 ? "warn" : "ok"}
            />
            <Stat label={t("season", { month: data.seasonLabel })} value={fmtMultiple(data.seasonIndex)} />
          </div>
          <p className="mt-2 text-[11px] text-muted">{t("seasonHint")}</p>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const color = tone === "warn" ? "text-negative" : tone === "ok" ? "text-positive" : "text-navy-800";
  return (
    <div>
      <div className={`tnum text-xl font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-muted">{label}</div>
    </div>
  );
}
