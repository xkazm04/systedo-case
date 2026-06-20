"use client";

import { Download } from "@/components/icons";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: { label: "Tisk / uložit PDF" },
  en: { label: "Print / save PDF" },
} as const;

/** Triggers the browser print dialog (→ "Save as PDF"). Zero-dependency PDF
 *  export; the print stylesheet hides the app chrome so only the report prints. */
export default function PrintButton({ label }: { label?: string }) {
  const t = useT(T);
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-4 py-2 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
    >
      <Download width={15} height={15} />
      {label ?? t("label")}
    </button>
  );
}
