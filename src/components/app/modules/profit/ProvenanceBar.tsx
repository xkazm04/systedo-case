"use client";

/** Provenance label (Direction 2): live synced Ads data vs the illustrative sample,
 *  consistent with the report's wording. Presentational child of ProfitModule. */

import { Pill } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { T } from "./strings";

export default function ProvenanceBar({ live, syncedAt }: { live: boolean; syncedAt?: string }) {
  const t = useT(T);
  return (
    <div className="flex items-center gap-2 text-xs">
      <Pill tone={live ? "positive" : "navy"}>{live ? t("liveData") : t("sampleData")}</Pill>
      {live && syncedAt && (
        <span className="text-muted">{t("synced", { date: syncedAt.slice(0, 10) })}</span>
      )}
    </div>
  );
}
