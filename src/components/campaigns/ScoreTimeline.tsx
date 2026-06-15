"use client";

/** Score-over-time timeline for a stored evaluation. Renders a dependency-free
 *  SVG sparkline of every health score on record for this scope/campaign (across
 *  periods, oldest → newest) on a fixed 0–100 domain, highlights the point this
 *  report card is about, and diffs it against the previous evaluation ("62 → 74")
 *  so the agency can answer "are our optimizations working?". */

import { TrendDown, TrendUp } from "@/components/icons";
import type { ReportHistoryPoint } from "@/lib/ai-types";
import { CAMPAIGN_PERIOD_LABELS, isCampaignPeriod } from "@/lib/campaigns/types";
import { fmtDateTime, fmtRelative, fmtSignedInt } from "@/lib/format";

const W = 600;
const H = 120;
const PAD = { t: 12, r: 16, b: 12, l: 16 };
const HEALTHY = 70; // ReportView treats a score ≥ 70 as "Zdravé"

const periodLabel = (p: string): string =>
  isCampaignPeriod(p) ? CAMPAIGN_PERIOD_LABELS[p] : p;

/** Colour tokens for a delta — green up, coral down, muted flat. */
function deltaTone(delta: number): { text: string; bg: string } {
  if (delta > 0) return { text: "text-positive", bg: "bg-positive-soft" };
  if (delta < 0) return { text: "text-coral-600", bg: "bg-coral-soft" };
  return { text: "text-muted", bg: "bg-navy-50" };
}

export default function ScoreTimeline({
  history,
  currentCreatedAt,
}: {
  history: ReportHistoryPoint[];
  /** createdAt of the report this card shows — used to highlight its point */
  currentCreatedAt?: string;
}) {
  const n = history.length;
  // A single evaluation has no trend to show yet.
  if (n < 2) return null;

  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / (n - 1)) * innerW;
  // Fixed 0–100 domain so the line height is an honest read of the score.
  const y = (score: number) =>
    PAD.t + (1 - Math.max(0, Math.min(100, score)) / 100) * innerH;

  const pts = history.map((p, i) => ({ ...p, cx: x(i), cy: y(p.score) }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${pts[n - 1].cx.toFixed(1)} ${(H - PAD.b).toFixed(1)} L${pts[0].cx.toFixed(
    1
  )} ${(H - PAD.b).toFixed(1)} Z`;

  // The point this card is about — fall back to the most recent evaluation.
  const matchIdx = currentCreatedAt
    ? history.findIndex((p) => p.createdAt === currentCreatedAt)
    : -1;
  const curIdx = matchIdx >= 0 ? matchIdx : n - 1;
  const cur = history[curIdx];
  const prev = curIdx > 0 ? history[curIdx - 1] : null;
  const delta = prev ? cur.score - prev.score : null;
  const tone = deltaTone(delta ?? 0);

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-navy-800">Vývoj skóre v čase</h4>
        {delta != null && prev && (
          <span
            className={`pill ${tone.bg} ${tone.text}`}
            title={`Změna oproti předchozímu vyhodnocení (${periodLabel(prev.period)}, ${fmtDateTime(
              prev.createdAt
            )})`}
          >
            {delta > 0 ? (
              <TrendUp width={12} height={12} />
            ) : delta < 0 ? (
              <TrendDown width={12} height={12} />
            ) : null}
            <span className="tnum">
              {prev.score} → {cur.score}
            </span>
            <span className="tnum font-semibold">({fmtSignedInt(delta)})</span>
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full"
        role="img"
        aria-label={`Vývoj skóre zdraví z ${n} vyhodnocení, naposledy ${cur.score} ze 100`}
      >
        {/* healthy reference line at 70 */}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(HEALTHY)}
          y2={y(HEALTHY)}
          stroke="var(--color-line)"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        <path d={area} fill="var(--color-brand-100)" opacity={0.5} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-brand-500)"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pts.map((p, i) => {
          const isCur = i === curIdx;
          return (
            <circle
              key={i}
              cx={p.cx}
              cy={p.cy}
              r={isCur ? 6 : 4}
              fill={isCur ? "var(--color-brand-600)" : "white"}
              stroke="var(--color-brand-600)"
              strokeWidth={2}
            >
              <title>{`${p.score}/100 · ${periodLabel(p.period)} · ${fmtDateTime(p.createdAt)}`}</title>
            </circle>
          );
        })}
      </svg>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>{n} vyhodnocení</span>
        <span aria-hidden>·</span>
        <span>skóre 0–100, čára 70 = zdravé</span>
        <span aria-hidden>·</span>
        <span>
          poslední <time dateTime={cur.createdAt}>{fmtRelative(cur.createdAt)}</time>
        </span>
      </p>
    </section>
  );
}
