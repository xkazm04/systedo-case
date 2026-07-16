/** D1 — a small, honest provenance chip for a local surface (coverage matrix,
 *  reputation cards). Mirrors the "živá data / ukázková data" language of the section
 *  import banners (LocalLadderSource / LocalSourcePanel), but as an inline pill for a
 *  panel header rather than a full banner. Server component; cs/en. */
import { Pill } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: { live: "živá data", sample: "ukázková data" },
  en: { live: "live data", sample: "sample data" },
} as const;

export default async function ProvenanceChip({ live }: { live: boolean }) {
  const t = await getT(T);
  return <Pill tone={live ? "positive" : "neutral"}>{live ? t("live") : t("sample")}</Pill>;
}
