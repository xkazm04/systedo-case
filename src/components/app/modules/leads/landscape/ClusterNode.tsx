"use client";

/** One cluster on the Krajina canvas: a disc sized by count (area ∝ count), a
 *  stage-mix ring around its edge, and a two-line label. Collapsed it shows the
 *  tally; expanded it becomes the container the individual dots sit inside, so
 *  the label moves above the disc and the fill recedes.
 *
 *  The ring is drawn only when the mix has actually landed from the server — a
 *  ring guessed from a total would be decoration pretending to be data. */
import { PIPELINE_STAGES } from "@/lib/leads/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { PlacedCluster } from "@/lib/leads/landscape";
import { SLA_COLOR, STAGE_COLOR } from "./labels";

const T = {
  cs: { breached: "{n} po SLA" },
  en: { breached: "{n} past SLA" },
} as const;

export default function ClusterNode({
  cluster,
  label,
  expanded,
  dimmed,
  onExpand,
}: {
  cluster: PlacedCluster;
  label: string;
  expanded: boolean;
  dimmed: boolean;
  onExpand: (key: string) => void;
}) {
  const t = useT(T);
  const { fmtInt } = useFormatters();
  const { cx, cy, r, count, mix } = cluster;
  // A campaign-suffixed source label can run to forty characters; the canvas
  // trims it rather than letting it collide with the next cluster. The full name
  // is one row away in the cluster list below.
  const short = label.length > 24 ? `${label.slice(0, 23)}…` : label;
  const breached = mix ? mix.sla.breached : null;
  const ringR = r - 5;
  const circumference = 2 * Math.PI * ringR;

  let offset = 0;
  const segments = mix
    ? PIPELINE_STAGES.filter((s) => (mix.byStage[s] ?? 0) > 0).map((s) => {
        const len = (circumference * (mix.byStage[s] ?? 0)) / Math.max(1, count);
        const seg = { stage: s, len, offset };
        offset += len;
        return seg;
      })
    : [];

  return (
    // Presentational on purpose: the SVG is one `role="img"`, and the accessible
    // control for this cluster is the real focusable button in `ClusterList`. A
    // `role="button"` here would promise keyboard operation the canvas cannot give
    // — and would paint a focus ring around the whole disc on every click.
    <g
      aria-hidden
      className="cursor-pointer"
      opacity={dimmed ? 0.35 : 1}
      onClick={() => onExpand(cluster.key)}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={expanded ? "var(--color-canvas)" : "var(--color-brand-50)"}
        stroke="var(--color-brand-200)"
        strokeWidth={2}
      />
      {segments.map((s) => (
        <circle
          key={s.stage}
          cx={cx}
          cy={cy}
          r={ringR}
          fill="none"
          stroke={STAGE_COLOR[s.stage]}
          strokeWidth={6}
          strokeDasharray={`${s.len} ${circumference}`}
          strokeDashoffset={-s.offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}

      {expanded ? (
        <>
          <text
            x={cx}
            y={cy - r - 22}
            textAnchor="middle"
            fontSize={16}
            fontWeight={700}
            fill="var(--color-brand-900)"
          >
            {short} · {fmtInt(count)}
          </text>
          {breached !== null && breached > 0 && (
            <text
              x={cx}
              y={cy - r - 4}
              textAnchor="middle"
              fontSize={14}
              fill="var(--color-muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {t("breached", { n: fmtInt(breached) })}
            </text>
          )}
        </>
      ) : (
        <>
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            fontSize={Math.max(16, Math.min(26, r * 0.32))}
            fontWeight={700}
            fill="var(--color-brand-900)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {fmtInt(count)}
          </text>
          <text x={cx} y={cy + r + 18} textAnchor="middle" fontSize={14} fill="var(--color-muted)">
            {short}
          </text>
          {breached !== null && breached > 0 && (
            <text
              x={cx}
              y={cy + r + 36}
              textAnchor="middle"
              fontSize={14}
              fill={SLA_COLOR.breached}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {t("breached", { n: fmtInt(breached) })}
            </text>
          )}
        </>
      )}
    </g>
  );
}
