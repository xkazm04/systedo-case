"use client";

/** Krajina's data seam — the two bounded reads the canvas is allowed to make.
 *
 *  `useAxisClusters` renders INSTANTLY from the `ContactSummary` the module already
 *  handed the view (no request at all for the source/stage/region axes), then
 *  enriches the same clusters with the stage/SLA mix from one `/crm/landscape`
 *  call, cached per axis for the life of the view. `useClusterPoints` fetches ONE
 *  expanded cluster's dots, capped server-side.
 *
 *  Nothing here ever asks for "all contacts" — that is the direction's whole
 *  premise (src/lib/leads/landscape.ts). */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import type { ContactSummary } from "@/lib/leads/summary";
import {
  clustersFromSummary,
  type ClusterSet,
  type LandscapeAxis,
  type LandscapePoint,
} from "@/lib/leads/landscape";

interface ClusterPayload extends ClusterSet {
  ok?: boolean;
  capped?: boolean;
  scanned?: number;
}

export interface AxisState {
  set: ClusterSet | null;
  /** the mix (rings, SLA tallies) has landed */
  enriched: boolean;
  loading: boolean;
  /** the server scan hit its bound — the canvas describes a slice */
  capped: boolean;
}

export function useAxisClusters(
  projectId: string,
  axis: LandscapeAxis,
  summary: ContactSummary | null
): AxisState {
  /** One result per axis, kept for the life of the view: switching Zdroj → Fáze →
   *  Zdroj is a re-render, not a re-fetch. Held in state (not a ref) because the
   *  render reads it, and written only from the async callback, so the effect
   *  never pushes state synchronously. */
  const [cache, setCache] = useState<Partial<Record<LandscapeAxis, ClusterPayload | "failed">>>({});

  useEffect(() => {
    if (cache[axis]) return;
    let cancelled = false;
    void (async () => {
      let result: ClusterPayload | "failed" = "failed";
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/crm/landscape?axis=${axis}`
        );
        const json = (await res.json()) as ClusterPayload;
        if (json?.ok) result = json;
      } catch {
        // A failed enrichment leaves the summary-seeded overview standing; the
        // rings simply do not draw. Degrading beats an empty canvas.
      }
      if (!cancelled) setCache((c) => ({ ...c, [axis]: result }));
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, axis, cache]);

  const hit = cache[axis];
  const served = hit && hit !== "failed" ? hit : null;
  // Memoised so the canvas layout (which is O(clusters × grid)) does not re-run on
  // every render just because the seed was rebuilt from an unchanged summary.
  const seed = useMemo(() => clustersFromSummary(summary, axis), [summary, axis]);
  const set = served ?? seed;
  return {
    set,
    enriched: served !== null,
    loading: set === null && hit !== "failed",
    capped: Boolean(served?.capped),
  };
}

export interface PointsState {
  points: LandscapePoint[];
  /** members beyond the per-cluster cap — disclosed, never silently dropped */
  truncated: number;
  count: number;
  loading: boolean;
}

const NO_POINTS: PointsState = { points: [], truncated: 0, count: 0, loading: false };

/** Loaded points are stored UNDER the request they answer, and `loading` is
 *  derived from "the stored request is not the current one" rather than pushed by
 *  the effect. That is what keeps the effect free of a synchronous setState —
 *  and, more usefully, makes a stale response impossible to render as the current
 *  cluster's dots. */
export function useClusterPoints(
  projectId: string,
  axis: LandscapeAxis,
  key: string | null
): PointsState {
  const [loaded, setLoaded] = useState<{ req: string; data: PointsState } | null>(null);
  const req = key ? `${axis}::${key}` : "";

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void (async () => {
      let data = NO_POINTS;
      try {
        const qs = `axis=${axis}&key=${encodeURIComponent(key)}`;
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/crm/landscape?${qs}`);
        const json = (await res.json()) as {
          ok?: boolean;
          points?: LandscapePoint[];
          truncated?: number;
          count?: number;
        };
        if (json?.ok) {
          data = {
            points: json.points ?? [],
            truncated: json.truncated ?? 0,
            count: json.count ?? 0,
            loading: false,
          };
        }
      } catch {
        // an unreachable endpoint leaves the cluster collapsed, never half-drawn
      }
      if (!cancelled) setLoaded({ req: `${axis}::${key}`, data });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, axis, key]);

  if (!key) return NO_POINTS;
  if (loaded?.req === req) return loaded.data;
  return { ...NO_POINTS, loading: true };
}

/** The canvas's CSS width in real pixels, so the SVG viewBox can be 1 unit = 1 px.
 *  That identity is what lets the HTML hover card be positioned from world
 *  coordinates without a second, drifting coordinate system. */
export function useMeasuredWidth(ref: RefObject<HTMLElement | null>, fallback = 1080): number {
  const [width, setWidth] = useState(fallback);
  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setWidth(Math.max(320, Math.round(el.clientWidth)));
  }, [ref]);

  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, ref]);

  return width;
}
