/** Ranking ladder — per-keyword local-rank history as a hand-rolled inverted-Y
 *  SVG sparkline (#1 at the top = best), the current position and how many spots
 *  it climbed over the tracked window. Server component; SVG on design tokens,
 *  reduced-motion-safe (static). Real seam: a rank tracker. */
import { Pill } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { changeSinceLast, ladderSpanDays, rankDecline, sortLadder } from "@/lib/mappack/compute";
import { rankTone } from "@/lib/local/tones";
import type { KeywordRank, RankPoint } from "@/lib/mappack/sample";

const T = {
  cs: {
    title: "Žebříček pozic klíčových slov",
    note: "Lokální pozice v čase (nahoře = lepší). Změna = posun od posledního importu. Cíl: dostat slabé pozice do TOP 3.",
    colKeyword: "Klíčové slovo",
    colTrendSpan: "Vývoj ({n} dní)",
    colTrendBare: "Vývoj",
    colCurrent: "Aktuálně",
    colChange: "Od posl. importu",
    climbed: "+{n}",
    slipped: "{n}",
    flat: "beze změny",
    firstImport: "První import: zatím není s čím porovnat",
    declining: "klesá",
    decliningTitle: "Klesá v {run} importech za sebou (−{drop} pozic)",
    untracked: "mimo import",
    untrackedTitle: "V posledním importu chybí. Historie zachována",
  },
  en: {
    title: "Keyword ranking ladder",
    note: "Local rank over time (top = better). Change = move since the last import. Goal: move weak positions into the TOP 3.",
    colKeyword: "Keyword",
    colTrendSpan: "Trend ({n} days)",
    colTrendBare: "Trend",
    colCurrent: "Current",
    colChange: "Since last import",
    climbed: "+{n}",
    slipped: "{n}",
    flat: "no change",
    firstImport: "First import: nothing to compare yet",
    declining: "declining",
    decliningTitle: "Declining for {run} imports in a row (−{drop} positions)",
    untracked: "absent",
    untrackedTitle: "Absent from the last import. History preserved",
  },
} as const;

const W = 150;
const H = 40;
const PAD = 6;

function Sparkline({ history, maxRank }: { history: RankPoint[]; maxRank: number }) {
  const n = history.length;
  // A freshly-imported ladder seeds a single-point history; i/(n-1) is 0/0 = NaN for
  // n===1, which produced "MNaN NaN" paths and cx={NaN}. Center a single point instead.
  const x = (i: number) => (n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD));
  // inverted: rank 1 at the top, maxRank at the bottom
  const y = (rank: number) => PAD + ((rank - 1) / (maxRank - 1)) * (H - 2 * PAD);
  const line = history.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.rank).toFixed(1)}`).join(" ");
  const last = history[n - 1]!.rank;
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
  const maxRank = Math.max(2, ...sorted.flatMap((r) => r.history.map((p) => p.rank)));
  // The actual observed tracking window — drives the header instead of a hardcoded 90d.
  const spanDays = ladderSpanDays(sorted);
  const trendLabel = spanDays > 0 ? t("colTrendSpan", { n: spanDays }) : t("colTrendBare");

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
              <th className="px-4 py-3 font-medium">{trendLabel}</th>
              <th className="px-4 py-3 text-center font-medium">{t("colCurrent")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("colChange")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              // Change column shows the move since the LAST import. KEEP it nullable:
              // null = a first/single observation (nothing to compare yet) → an em dash,
              // distinct from a true 0 ("beze změny", held position across two imports).
              const delta = changeSinceLast(r);
              // Sustained multi-import decline (D3) — a small honest badge, distinct
              // from the single-step "since last import" move in the change column.
              const decline = rankDecline(r);
              return (
                <tr key={r.id} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {r.keyword}
                      {decline && (
                        <Pill
                          tone="coral"
                          className="text-[10px]"
                        >
                          <span title={t("decliningTitle", { run: decline.run, drop: decline.droppedBy })}>
                            ▼ {t("declining")}
                          </span>
                        </Pill>
                      )}
                      {r.untracked && (
                        <Pill tone="neutral" className="text-[10px]">
                          <span title={t("untrackedTitle")}>{t("untracked")}</span>
                        </Pill>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Sparkline history={r.history} maxRank={maxRank} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Pill tone={rankTone(r.current)}>#{r.current}</Pill>
                  </td>
                  <td className="tnum px-4 py-3 text-right font-semibold">
                    {delta === null ? (
                      <span className="text-muted" title={t("firstImport")}>—</span>
                    ) : delta > 0 ? (
                      <span className="text-positive">▲ {t("climbed", { n: delta })}</span>
                    ) : delta < 0 ? (
                      <span className="text-coral-600">▼ {t("slipped", { n: Math.abs(delta) })}</span>
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
