"use client";

/** The individual dots of ONE expanded cluster.
 *
 *  Radial position = age (centre newest, rim oldest, computed server-side by
 *  `layoutPoints` so the same person always lands on the same spot); colour = SLA
 *  phase. Capped at `POINT_CAP` and viewport-culled, which is what keeps the
 *  prototype inside its stated budget of roughly a thousand live SVG nodes —
 *  above that this direction needs WebGL, which is explicitly out of scope.
 *
 *  Motion: a short staggered fade in, short-circuited under prefers-reduced-motion
 *  by the same `useReducedMotion` contract the Kinetics primitives use. Requires a
 *  <MotionProvider> ancestor (the `m.*` primitives need LazyMotion). */
import { m, useReducedMotion } from "framer-motion";
import { easeAdamant } from "@/lib/motion";
import type { LandscapePoint, PlacedCluster } from "@/lib/leads/landscape";
import { SLA_COLOR } from "./labels";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DOT_R = 5;

/** Where a dot sits on the canvas, in container pixels. Exported because the lasso
 *  and the hover card must agree with the rendered circle to the pixel — two
 *  copies of this formula is exactly how a marquee starts selecting the wrong
 *  people. */
export function pointXY(cluster: PlacedCluster, p: LandscapePoint): { x: number; y: number } {
  const span = cluster.r - DOT_R * 2;
  return { x: cluster.cx + p.x * span, y: cluster.cy + p.y * span };
}

export default function PointCloud({
  cluster,
  points,
  opacity,
  selected,
  activeId,
  viewport,
  onHover,
  onSelect,
}: {
  cluster: PlacedCluster;
  points: readonly LandscapePoint[];
  /** 0–1 ramp from the zoom scrubber; the cloud is absent, not just faint, at 0 */
  opacity: number;
  selected: ReadonlySet<string>;
  activeId: string | null;
  viewport: Rect;
  onHover: (p: LandscapePoint | null) => void;
  onSelect: (p: LandscapePoint) => void;
}) {
  const reduce = useReducedMotion();
  if (opacity <= 0.01) return null;

  return (
    <g opacity={opacity}>
      {points.map((p, i) => {
        const { x: cx, y: cy } = pointXY(cluster, p);
        // Viewport culling: a dot outside the panned window is not rendered at all.
        if (
          cx < viewport.x - DOT_R ||
          cx > viewport.x + viewport.w + DOT_R ||
          cy < viewport.y - DOT_R ||
          cy > viewport.y + viewport.h + DOT_R
        ) {
          return null;
        }
        const isSel = selected.has(p.id);
        const isActive = activeId === p.id;
        return (
          <m.circle
            key={p.id}
            cx={cx}
            cy={cy}
            r={isActive || isSel ? DOT_R + 2 : DOT_R}
            fill={SLA_COLOR[p.slaPhase]}
            stroke={isSel ? "var(--color-ink)" : "var(--color-surface)"}
            strokeWidth={isSel ? 2 : 1}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.35, ease: easeAdamant, delay: Math.min(0.4, i * 0.002) }
            }
            style={{ cursor: "pointer" }}
            onMouseEnter={() => onHover(p)}
            onMouseLeave={() => onHover(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(p);
            }}
          />
        );
      })}
    </g>
  );
}
