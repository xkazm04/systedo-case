"use client";

/** ADR-0010 — narrow the union read to ONE ad network.
 *
 *  Built from the response's own `sources` sections rather than a fixed list, so
 *  the control offers exactly the networks the project actually holds and its
 *  order is the read's precedence order (Google first, then Sklik). Rendered only
 *  for a genuine union; a single-source console never sees it. */
import Segmented from "@/components/dashboard/vykon/Segmented";
import { useT } from "@/lib/i18n/client";
import type { AdsSource } from "@/lib/campaigns/types";
import type { CampaignsSourceMeta } from "../useCampaigns";
import { sourceLabelKey } from "./SourceBadge";

export type SourceFilterValue = AdsSource | "all";

const T = {
  cs: {
    "google-ads": "Google Ads",
    sklik: "Sklik",
    sample: "Ukázka",
    all: "Vše",
    aria: "Filtrovat podle reklamní sítě",
    count: "{n} kampaní z tohoto zdroje",
  },
  en: {
    "google-ads": "Google Ads",
    sklik: "Sklik",
    sample: "Sample",
    all: "All",
    aria: "Filter by ad network",
    count: "{n} campaigns from this source",
  },
} as const;

export default function SourceFilter({
  value,
  onChange,
  sources,
}: {
  value: SourceFilterValue;
  onChange: (v: SourceFilterValue) => void;
  /** the union's sections, in read precedence order */
  sources: CampaignsSourceMeta[];
}) {
  const t = useT(T);
  const total = sources.reduce((n, s) => n + s.campaigns, 0);
  // Two sections CAN report the same source (both tenants degraded to sample), so
  // fold them into one option instead of emitting a duplicate segment.
  const perSource = new Map<AdsSource, number>();
  for (const s of sources) perSource.set(s.source, (perSource.get(s.source) ?? 0) + s.campaigns);
  const options: { value: SourceFilterValue; label: string; title: string }[] = [
    { value: "all", label: t("all"), title: t("count", { n: total }) },
    ...[...perSource].map(([source, n]) => ({
      value: source as SourceFilterValue,
      label: t(sourceLabelKey(source)),
      title: t("count", { n }),
    })),
  ];
  return (
    <Segmented<SourceFilterValue>
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel={t("aria")}
    />
  );
}
