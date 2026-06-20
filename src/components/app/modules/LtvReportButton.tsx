"use client";

import { Download } from "@/components/icons";
import { buildCohortCsv } from "@/lib/ltv/compute";
import type { CohortMetrics } from "@/lib/ltv/compute";
import { downloadText } from "@/lib/export";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: { download: "Stáhnout report" },
  en: { download: "Download report" },
} as const;

/** Client-only "Stáhnout report" action: builds the cohort CSV from the rows
 *  passed by the server-rendered module and triggers a browser download. The CSV
 *  is built lazily on click (no work during render), keeping the parent a pure
 *  server component. */
export default function LtvReportButton({ rows }: { rows: CohortMetrics[] }) {
  const t = useT(T);
  function onDownload() {
    downloadText("kohorty-cac-ltv.csv", buildCohortCsv(rows));
  }
  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={rows.length === 0}
      className="inline-flex items-center gap-2 rounded-card border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download width={15} height={15} className="shrink-0" />
      {t("download")}
    </button>
  );
}
