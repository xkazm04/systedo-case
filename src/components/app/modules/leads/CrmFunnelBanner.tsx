/** Provenance strip for Kvalita leadů when the funnel runs on the CRM contacts tier
 *  (lead-quality/funnel-tier.ts). It takes the place of the import panel's banner
 *  and states three things: the funnel is live and comes from Leady, how many
 *  contacts it counts (and whether the bounded scan capped it), and whether a stored
 *  import is being shadowed. That paste is disclosed, never dropped silently. Server
 *  component, cs/en, token classes only. */
import Link from "next/link";
import { Check } from "@/components/icons";
import { getServerFormatters, getT } from "@/lib/i18n/server";

const T = {
  cs: {
    live: "Živá data · z CRM (Leady) · {count} kontaktů",
    capped: "Trychtýř počítá {scanned} naposledy upravených kontaktů z {count}.",
    shadowed:
      "Uložený import ({rows} řádků) se nezobrazuje, protože přednost mají kontakty v CRM.",
    open: "Otevřít Leady",
  },
  en: {
    live: "Live data · from CRM (Leady) · {count} contacts",
    capped: "The funnel counts the {scanned} most recently updated of {count} contacts.",
    shadowed: "A saved import ({rows} rows) is not shown because the CRM contacts take precedence.",
    open: "Open Leady",
  },
} as const;

export default async function CrmFunnelBanner({
  projectId,
  contactCount,
  scanned,
  shadowedImportRows,
}: {
  projectId: string;
  /** how many contacts the project holds */
  contactCount: number;
  /** how many the funnel counted, when the scan was capped below `contactCount` */
  scanned?: number;
  /** rows of a stored import the contacts shadow */
  shadowedImportRows?: number;
}) {
  const t = await getT(T);
  const fmt = await getServerFormatters();
  const count = fmt.fmtInt(contactCount);
  return (
    <div className="space-y-1.5 rounded-lg bg-positive-soft px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-medium text-positive">
          <Check width={12} height={12} className="mb-0.5 mr-1 inline" />
          {t("live", { count })}
        </span>
        <Link
          href={`/app/${projectId}/leady`}
          className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300"
        >
          {t("open")}
        </Link>
      </div>
      {scanned != null && scanned < contactCount && (
        <p className="text-muted">{t("capped", { scanned: fmt.fmtInt(scanned), count })}</p>
      )}
      {shadowedImportRows != null && shadowedImportRows > 0 && (
        <p className="text-muted">{t("shadowed", { rows: fmt.fmtInt(shadowedImportRows) })}</p>
      )}
    </div>
  );
}
