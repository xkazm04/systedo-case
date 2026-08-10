/** "Insights" — a descriptive rollup over the attribution rows: the best channel /
 *  format / length by reach-weighted CTR, plus a per-channel CTR sparkline. Start
 *  descriptive (no new backend) — the seam is real per-variant click analytics
 *  replacing the sample.
 *
 *  Code-split (see DistributionModule): this panel is the module's below-fold tail
 *  and the only thing that pulls the Sparkline chart primitive and the learnings
 *  rollup in, so keeping it out of the first bundle is a real win rather than a
 *  skeleton flash. Its provenance is the attribution's, because it is a pure
 *  function OF the attribution — it can never be more trustworthy than its input. */
"use client";

import { useMemo } from "react";
import { Pill } from "@/components/ui";
import { Bulb } from "@/components/icons";
import Sparkline from "@/components/charts/Sparkline";
import type { ChannelPerf } from "@/lib/distribution/sample";
import {
  FORMAT_LABELS,
  LENGTH_LABELS,
  rollupLearnings,
  type DimensionLeader,
} from "@/lib/distribution/learnings";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import SampleChip from "./SampleChip";

const T = {
  cs: {
    title: "Poznatky",
    desc: "Co nejvíc korelovalo s prokliky (CTR).",
    avgCtr: "Průměrné CTR {n}",
    bestChannel: "Nejlepší kanál",
    bestFormat: "Nejlepší formát",
    bestLength: "Nejlepší délka",
    variantSingular: "varianta",
    variantFew: "varianty",
    variantMany: "variant",
    ctrByChannel: "CTR podle kanálu",
    bestVariantLabel: "Nejlepší varianta:",
    sparkAriaLabel: "CTR podle kanálu: {items}. Nejvyšší: {peak}.",
  },
  en: {
    title: "Insights",
    desc: "What correlated most with clicks (CTR).",
    avgCtr: "Average CTR {n}",
    bestChannel: "Best channel",
    bestFormat: "Best format",
    bestLength: "Best length",
    variantSingular: "variant",
    variantFew: "variants",
    variantMany: "variants",
    ctrByChannel: "CTR by channel",
    bestVariantLabel: "Best variant:",
    sparkAriaLabel: "CTR by channel: {items}. Peak: {peak}.",
  },
} as const;

const SPARK_W = 120;
const SPARK_H = 28;

/** Per-channel CTR sparkline over the shared chart primitive — `markPeak` puts the
 *  dot on the BEST channel (not the last point), which is the semantic the
 *  hand-rolled version existed for. */
function CtrSparkline({
  ctrs,
  label,
}: {
  ctrs: number[];
  /** pre-interpolated aria label (the parent owns the translator) */
  label: string;
}) {
  if (ctrs.length < 2) return null;
  return (
    <Sparkline
      values={ctrs}
      width={SPARK_W}
      height={SPARK_H}
      area={false}
      stroke="var(--color-brand-accent)"
      strokeWidth={1.75}
      markPeak
      className="overflow-visible"
      label={label}
    />
  );
}

export default function LearningsPanel({
  attribution,
  variants,
  sample,
}: {
  attribution: ChannelPerf[];
  variants: { channel: string; text: string }[];
  /** provenance of the attribution these insights are rolled up FROM */
  sample: boolean;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const { locale } = useLocale();

  const learnings = useMemo(() => {
    const lengthByChannel = new Map(variants.map((v) => [v.channel, v.text.length] as const));
    return rollupLearnings(attribution, (channel) => lengthByChannel.get(channel) ?? 0);
  }, [attribution, variants]);

  if (learnings.rows.length === 0) return null;

  // The channel leader is a proper noun (LinkedIn); format + length are derived
  // BUCKET KEYS and get their label here, at the render edge.
  const leaders: { label: string; leader: DimensionLeader | null; value: string | null }[] = [
    { label: t("bestChannel"), leader: learnings.bestChannel, value: learnings.bestChannel?.value ?? null },
    {
      label: t("bestFormat"),
      leader: learnings.bestFormat,
      value: learnings.bestFormat ? FORMAT_LABELS[locale][learnings.bestFormat.value] : null,
    },
    {
      label: t("bestLength"),
      leader: learnings.bestLength,
      value: learnings.bestLength ? LENGTH_LABELS[locale][learnings.bestLength.value] : null,
    },
  ];

  const ctrs = learnings.rows.map((r) => r.ctr);
  const channels = learnings.rows.map((r) => r.channel);
  const peakIndex = ctrs.reduce((best, v, i) => (v > ctrs[best]! ? i : best), 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-accent">
            <Bulb width={16} height={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-navy-800">{t("title")}</h3>
            <p className="mt-0.5 text-xs text-muted">{t("desc")}</p>
          </div>
        </div>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <SampleChip sample={sample} />
          <Pill tone="positive">{t("avgCtr", { n: fmt.fmtPct(learnings.overallCtr) })}</Pill>
        </span>
      </div>

      <div className="grid gap-px bg-line sm:grid-cols-3">
        {leaders.map(({ label, leader, value }) => (
          <div key={label} className="bg-surface px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
            {leader ? (
              <>
                <p className="mt-1 text-sm font-semibold text-navy-800">{value}</p>
                <p className="tnum mt-0.5 text-xs text-muted">
                  CTR {fmt.fmtPct(leader.ctr)} · {leader.variants}{" "}
                  {leader.variants === 1
                    ? t("variantSingular")
                    : leader.variants < 5
                      ? t("variantFew")
                      : t("variantMany")}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">—</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("ctrByChannel")}</p>
          <p className="mt-1 text-sm text-navy-700">
            {t("bestVariantLabel")}{" "}
            <span className="font-semibold text-navy-800">{learnings.bestVariant?.channel}</span>{" "}
            <span className="tnum text-muted">({fmt.fmtPct(learnings.bestVariant?.ctr ?? 0)})</span>
          </p>
        </div>
        <CtrSparkline
          ctrs={ctrs}
          label={t("sparkAriaLabel", {
            items: channels.map((l, i) => `${l} ${fmt.fmtPct(ctrs[i] ?? 0)}`).join(", "),
            peak: channels[peakIndex] ?? "",
          })}
        />
      </div>
    </div>
  );
}
