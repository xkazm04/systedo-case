"use client";

/** The pannable canvas itself: clusters, the focused cluster's dots, the marquee,
 *  and the hover card.
 *
 *  Coordinate contract — the SVG viewBox is `0 0 width height` in CONTAINER PIXELS
 *  and the only transform is a pan translate. That is what lets an HTML card and
 *  an SVG circle share one coordinate system without a projection layer, and it is
 *  why zoom here is SEMANTIC (the focused cluster grows, see `focusLayout`) rather
 *  than a `scale()` every child would have to divide back out.
 *
 *  Every pointer gesture on this canvas has a keyboard equivalent OUTSIDE it (the
 *  cluster/contact list in `ClusterList`), which is the honest arrangement: an SVG
 *  marquee cannot be driven from a keyboard, so the keyboard gets the list. */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LandscapePoint, PlacedCluster } from "@/lib/leads/landscape";
import ClusterNode from "./ClusterNode";
import PointCloud, { pointXY, type Rect } from "./PointCloud";
import PointCard from "./PointCard";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export default function LandscapeCanvas({
  placed,
  box,
  labelOf,
  ariaLabel,
  focusKey,
  points,
  pointOpacity,
  selection,
  lasso,
  onExpand,
  onSelection,
  onOpen,
  onReply,
  onWheelZoom,
}: {
  placed: readonly PlacedCluster[];
  box: { width: number; height: number };
  labelOf: (key: string) => string;
  ariaLabel: string;
  focusKey: string | null;
  points: readonly LandscapePoint[];
  pointOpacity: number;
  selection: ReadonlySet<string>;
  lasso: boolean;
  onExpand: (key: string) => void;
  onSelection: (ids: string[]) => void;
  onOpen: (p: LandscapePoint) => void;
  onReply: (p: LandscapePoint) => void;
  onWheelZoom: (delta: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [card, setCard] = useState<LandscapePoint | null>(null);

  const focus = placed.find((c) => c.key === focusKey) ?? null;
  const viewport: Rect = { x: -pan.x, y: -pan.y, w: box.width, h: box.height };

  const local = (e: ReactPointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0) - pan.x, y: e.clientY - (r?.top ?? 0) - pan.y };
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    if (lasso) setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    else setDrag({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
  };

  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (marquee) {
      const p = local(e);
      setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
      return;
    }
    if (!drag) return;
    // Panning is bounded to half a canvas in each direction — an unbounded pan is
    // how an operator loses the map and has to reload the page to find it again.
    const lim = { x: box.width * 0.6, y: box.height * 0.6 };
    setPan({
      x: clamp(drag.panX + (e.clientX - drag.x), -lim.x, lim.x),
      y: clamp(drag.panY + (e.clientY - drag.y), -lim.y, lim.y),
    });
  };

  /** The release point is read from the UP event, not from the last move: a drag
   *  that produced no intermediate pointermove (a coarse pointer, an assistive
   *  device, an automated one) would otherwise finish as a zero-area marquee that
   *  silently selects nobody. */
  const up = (e?: ReactPointerEvent<SVGSVGElement>) => {
    if (marquee && focus) {
      const end = e ? local(e) : { x: marquee.x1, y: marquee.y1 };
      const lo = { x: Math.min(marquee.x0, end.x), y: Math.min(marquee.y0, end.y) };
      const hi = { x: Math.max(marquee.x0, end.x), y: Math.max(marquee.y0, end.y) };
      const hit = points.filter((p) => {
        const { x, y } = pointXY(focus, p);
        return x >= lo.x && x <= hi.x && y >= lo.y && y <= hi.y;
      });
      onSelection(hit.map((p) => p.id));
    }
    setMarquee(null);
    setDrag(null);
  };

  const cardPos = card && focus ? pointXY(focus, card) : null;

  return (
    <div className="relative select-none overflow-hidden rounded-card border border-line bg-surface bg-facets">
      <svg
        ref={svgRef}
        width={box.width}
        height={box.height}
        viewBox={`0 0 ${box.width} ${box.height}`}
        className={lasso ? "block cursor-crosshair touch-none" : "block cursor-grab touch-none"}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={(e) => onWheelZoom(e.deltaY)}
        role="img"
        aria-label={ariaLabel}
      >
        <g transform={`translate(${pan.x} ${pan.y})`}>
          {placed.map((c) => {
            // Viewport culling — a cluster wholly outside the panned window is not
            // rendered. Cheap here (≤ CLUSTER_CAP), and it keeps the node budget
            // honest once a focused cluster pushes its neighbours off-canvas.
            if (
              c.cx + c.r < viewport.x ||
              c.cx - c.r > viewport.x + viewport.w ||
              c.cy + c.r < viewport.y ||
              c.cy - c.r > viewport.y + viewport.h
            ) {
              return null;
            }
            return (
              <ClusterNode
                key={c.key}
                cluster={c}
                label={labelOf(c.key)}
                expanded={c.key === focusKey && pointOpacity > 0.01}
                dimmed={focusKey !== null && c.key !== focusKey}
                onExpand={onExpand}
              />
            );
          })}
          {focus && (
            <PointCloud
              cluster={focus}
              points={points}
              opacity={pointOpacity}
              selected={selection}
              activeId={card?.id ?? null}
              viewport={viewport}
              onHover={(p) => p && setCard(p)}
              onSelect={setCard}
            />
          )}
          {marquee && (
            <rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="var(--color-brand-500)"
              fillOpacity={0.12}
              stroke="var(--color-brand-600)"
              strokeDasharray="4 4"
            />
          )}
        </g>
      </svg>

      {card && cardPos && (
        <PointCard
          point={card}
          x={cardPos.x + pan.x}
          y={cardPos.y + pan.y}
          boxWidth={box.width}
          onOpen={onOpen}
          onReply={onReply}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  );
}
