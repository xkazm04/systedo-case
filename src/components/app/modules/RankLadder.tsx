/** Ranking ladder — per-keyword local-rank history as a hand-rolled inverted-Y
 *  SVG sparkline (#1 at the top = best), the current position and how many spots
 *  it climbed over the tracked window. Server component; SVG on design tokens,
 *  reduced-motion-safe (static). Real seam: a rank tracker. */
import { Pill } from "@/components/ui";
import type { PillTone } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { ladderDelta, sortLadder } from "@/lib/mappack/compute";
import type { KeywordRank } from "@/lib/mappack/sample";

const T = {
  cs: {
    title: "Žebříček pozic klíčových slov",
    note: "Lokální pozice v čase (nahoře = lepší). Cíl: dostat slabé pozice do TOP 3.",
    colKeyword: "Klíčové slovo",
    colTrend: "Vývoj (90 dní)",
    colCurrent: "Aktuálně",
    colChange: "Změna",
    climbed: "+{n}",
    slipped: "{n}",
    flat: "beze změny",
  },
  en: {
    title: "Keyword ranking ladder",
    note: "Local rank over time (top = better). Goal: move weak positions into the TOP 3.",
    colKeyword: "Keyword",
    colTrend: "Trend (90 days)",
    colCurrent: "Current",
    colChange: "Change",
    climbed: "+{n}",
    slipped: "{n}",
    flat: "no change",
  },
} as const;

function rankTone(rank: number): PillTone {
  if (rank <= 3) return "positive";
  if (rank <= 10) return "negative";
  return "coral";
}

const W = 150;
const H = 40;
const PAD = 6;

function Sparkline({ history, maxRank }: { history: number[]; maxRank: number }) {
  const n = history.length;
  const x = (i: number) => PAD + (i / (n - 1)) * (W - 2 * PAD);
  // inverted: rank 1 at the top, maxRank at the bottom
  const y = (rank: number) => PAD + ((rank - 1) / (maxRank - 1)) * (H - 2 * PAD);
  const line = history.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(r).toFixed(1)}`).join(" ");
  const last = history[n - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible" aria-hidden>
      <path
        d={line}
        pathLength={1}
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="chart-draw"
      />
      <circle cx={x(n - 1)} cy={y(last)} r={3} fill="var(--color-brand-500)" stroke="var(--color-surface)" strokeWidth={1.5} />
    </svg>
  );
}

export default async function RankLadder({ rows }: { rows: KeywordRank[] }) {
  const t = await getT(T);
  const sorted = sortLadder(rows);
  const maxRank = Math.max(2, ...sorted.flatMap((r) => r.history));

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-base font-semibold text-navy-800">{t("title")}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-medium">{t("colKeyword")}</th>
              <th className="px-4 py-3 font-medium">{t("colTrend")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("colCurrent")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("colChange")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const delta = ladderDelta(r);
              return (
                <tr key={r.id} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{r.keyword}</td>
                  <td className="px-4 py-3">
                    <Sparkline history={r.history} maxRank={maxRank} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Pill tone={rankTone(r.current)}>#{r.current}</Pill>
                  </td>
                  <td className="tnum px-4 py-3 text-right font-semibold">
                    {delta > 0 ? (
                      <span className="text-positive">▲ {t("climbed", { n: delta })}</span>
                    ) : delta < 0 ? (
                      <span className="text-coral-600">▼ {t("slipped", { n: delta })}</span>
                    ) : (
                      <span className="text-muted">{t("flat")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-5 py-3 text-xs text-muted">{t("note")}</div>
    </div>
  );
}
