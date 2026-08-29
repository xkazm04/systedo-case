/** Per-channel attribution: reach, clicks, CTR and share of total clicks, keyed by
 *  the same `utm_source` value the variant links above are stamped with — so the
 *  table is verifiable against the links rather than merely asserted.
 *
 *  Provenance is the panel's own (SampleChip), not the page's: these rows come
 *  from `attributionForProject`, a per-project scaling of a static fixture with no
 *  analytics import seam, and stay illustrative even for a project distributing
 *  its own article. */
"use client";

import { Pill } from "@/components/ui";
import type { ChannelPerf } from "@/lib/distribution/sample";
import { channelUtmSource } from "@/lib/distribution/utm";
import { useFormatters, useT } from "@/lib/i18n/client";
import SampleChip from "./SampleChip";

const T = {
  cs: {
    title: "Atribuce podle kanálu",
    descPre: "Řádky odpovídají hodnotám ",
    descPost: " z odkazů výše.",
    descLive: "Změřeno na vašich odkazech /go za posledních 30 dní.",
    bestClicks: "Nejvíc prokliků: {n}",
    colChannel: "Kanál",
    colReach: "Dosah",
    colLinks: "Odkazy",
    colClicks: "Prokliky",
    colShare: "Podíl",
    empty: "Zatím žádná data atribuce. Připojte analytiku a řádky se doplní.",
  },
  en: {
    title: "Attribution by channel",
    descPre: "Rows correspond to the ",
    descPost: " values from the links above.",
    descLive: "Measured on your own /go links over the last 30 days.",
    bestClicks: "Most clicks: {n}",
    colChannel: "Channel",
    colReach: "Reach",
    colLinks: "Links",
    colClicks: "Clicks",
    colShare: "Share",
    empty: "No attribution data yet. Connect analytics and rows will fill in.",
  },
} as const;

export default function AttributionTable({
  attribution,
  sample,
  live = false,
}: {
  attribution: ChannelPerf[];
  /** provenance of THESE rows — see lib/distribution/provenance */
  sample: boolean;
  /** the rows are MEASURED `/go` outcomes, not the fixture (WP W2-A). Then `reach`
   *  is the count of minted LINKS, so the column is relabelled and the CTR column
   *  disappears — clicks-per-link is not a click-through rate, and printing it
   *  under a "CTR" header would be a number the product cannot stand behind. */
  live?: boolean;
}) {
  const t = useT(T);
  const fmt = useFormatters();

  const totalClicks = attribution.reduce((a, c) => a + c.clicks, 0);
  // `attribution` may be empty (a project with no channel data yet — the type permits
  // it). Guard the reduce seed so the module renders a graceful empty state instead
  // of unmounting with a client error.
  const best = attribution.length > 0 ? attribution.reduce((a, b) => (b.clicks > a.clicks ? b : a)) : null;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-navy-800">{t("title")}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {live ? (
              t("descLive")
            ) : (
              <>
                {t("descPre")}
                <code className="font-mono text-[0.7rem] text-navy-700">utm_source</code>
                {t("descPost")}
              </>
            )}
          </p>
        </div>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <SampleChip sample={sample} />
          {best && <Pill tone="positive">{t("bestClicks", { n: best.channel })}</Pill>}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-medium">{t("colChannel")}</th>
              <th className="px-4 py-3 font-medium">utm_source</th>
              <th className="px-4 py-3 text-right font-medium">
                {live ? t("colLinks") : t("colReach")}
              </th>
              <th className="px-4 py-3 text-right font-medium">{t("colClicks")}</th>
              {!live && <th className="px-4 py-3 text-right font-medium">CTR</th>}
              <th className="px-4 py-3 text-right font-medium">{t("colShare")}</th>
            </tr>
          </thead>
          <tbody>
            {attribution.length === 0 && (
              <tr>
                <td colSpan={live ? 5 : 6} className="px-5 py-8 text-center text-sm text-muted">
                  {t("empty")}
                </td>
              </tr>
            )}
            {attribution.map((c) => (
              <tr key={c.channel} className="border-b border-line/70 last:border-0">
                <td className="px-5 py-3 font-medium text-navy-800">{c.channel}</td>
                <td className="px-4 py-3">
                  <code className="font-mono text-xs text-navy-600">{channelUtmSource(c.channel)}</code>
                </td>
                <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(c.reach)}</td>
                <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(c.clicks)}</td>
                {!live && (
                  <td className="tnum px-4 py-3 text-right text-navy-700">
                    {fmt.fmtPct(c.reach > 0 ? c.clicks / c.reach : 0)}
                  </td>
                )}
                <td className="tnum px-4 py-3 text-right font-medium text-navy-800">
                  {fmt.fmtPct(totalClicks > 0 ? c.clicks / totalClicks : 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
