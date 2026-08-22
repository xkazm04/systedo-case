/** KRAJINA — the pure geometry + clustering behind the lead landscape (the
 *  semantic-zoom canvas in `components/app/modules/leads/landscape/`).
 *
 *  The whole reason this direction exists is a SCALING rule: a canvas of every
 *  contact does not survive a 20 000-contact project, so the landscape is built
 *  from two bounded reads and never from "all contacts":
 *
 *    1. OVERVIEW — one aggregate per axis. The client renders it instantly from
 *       the `ContactSummary` it already holds (`clustersFromSummary`), and the
 *       landscape endpoint enriches the same clusters with a stage/SLA mix from
 *       ONE bounded server scan (`buildClusters`). Both run over the same
 *       resolved set with the same rules, so the two never disagree about a count.
 *    2. EXPANSION — individual dots for ONE cluster at a time, capped at
 *       `POINT_CAP`, with the overflow disclosed (`truncated`) rather than
 *       silently dropped.
 *
 *  Everything here is PURE: no React, no store, no `Date.now()` of its own. That
 *  is what makes the layout deterministic — the same contact lands on the same
 *  pixel across renders, reloads and machines, which is the difference between a
 *  map and a lava lamp. */
import { PIPELINE_STAGES, type Contact, type LeadGrade, type PipelineStage } from "./types";
import { sourceLabel } from "./aggregate";
import { contactSla, isQueued, type SlaPhase } from "./sla";
import { regionLabel, type ContactSummary } from "./summary";
import type { ContactQuery } from "./store-filter";

/* ── axes ────────────────────────────────────────────────────────────────────── */

export const LANDSCAPE_AXES = ["source", "stage", "region", "owner"] as const;
export type LandscapeAxis = (typeof LANDSCAPE_AXES)[number];

export function isLandscapeAxis(v: unknown): v is LandscapeAxis {
  return typeof v === "string" && (LANDSCAPE_AXES as readonly string[]).includes(v);
}

/** The key a contact clusters under on an axis, or `null` when the axis cannot
 *  place it (a contact with no location is absent from the region landscape —
 *  the same honesty `summary.byRegion` already applies, never an "Unknown" bucket
 *  that invents a region).
 *
 *  The source key is the DERIVED display label (`sourceLabel`), which is exactly
 *  what `ContactSummary.bySource[].label` carries — that identity is what lets the
 *  summary seed the canvas without a second vocabulary. */
export function clusterKeyOf(c: Contact, axis: LandscapeAxis): string | null {
  switch (axis) {
    case "source":
      return sourceLabel(c.attribution);
    case "stage":
      return c.stage;
    case "region":
      return regionLabel(c);
    case "owner":
      return c.ownerId?.trim() || OWNER_UNASSIGNED;
  }
}

/** Adamant is single-operator today: every contact without an explicit `ownerId`
 *  clusters here. Rendered as one honest cluster rather than faked owners. */
export const OWNER_UNASSIGNED = "unassigned";

/* ── clusters ────────────────────────────────────────────────────────────────── */

/** How many clusters the canvas draws. A campaign-suffixed source label set is
 *  unbounded and a canvas of forty circles is a word cloud; what did not fit is
 *  reported in `other`, never dropped. */
export const CLUSTER_CAP = 12;

export interface ClusterMix {
  byStage: Record<PipelineStage, number>;
  sla: Record<SlaPhase, number>;
}

export interface ClusterAgg {
  key: string;
  count: number;
  /** present only on the server-computed clusters (the summary seed has no cross-tab) */
  mix?: ClusterMix;
}

export interface ClusterSet {
  axis: LandscapeAxis;
  clusters: ClusterAgg[];
  /** the clusters the cap left out — disclosed */
  other: { groups: number; count: number };
  /** contacts the axis could not place (region only) */
  unplaced: number;
}

function emptyMix(): ClusterMix {
  return {
    byStage: Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0])) as Record<PipelineStage, number>,
    sla: { ontrack: 0, warning: 0, breached: 0, settled: 0 },
  };
}

/** The SLA phase a landscape dot is coloured by. Mirrors `summarizeContacts`: a
 *  contact that has left the queue is `settled`, never "breached forever". */
export function pointPhase(c: Contact, nowMs: number): SlaPhase {
  return isQueued(c) ? contactSla(c, nowMs).phase : "settled";
}

/** Cluster a bounded contact slice along an axis, with the per-cluster stage and
 *  SLA mix the overview ring renders. Biggest first, then alphabetical — a stable
 *  order two renders cannot disagree on. */
export function buildClusters(
  contacts: readonly Contact[],
  axis: LandscapeAxis,
  nowMs: number,
  cap: number = CLUSTER_CAP
): ClusterSet {
  const acc = new Map<string, ClusterAgg>();
  let unplaced = 0;

  for (const c of contacts) {
    const key = clusterKeyOf(c, axis);
    if (key === null) {
      unplaced += 1;
      continue;
    }
    let row = acc.get(key);
    if (!row) {
      row = { key, count: 0, mix: emptyMix() };
      acc.set(key, row);
    }
    row.count += 1;
    const mix = row.mix!;
    mix.byStage[c.stage] = (mix.byStage[c.stage] ?? 0) + 1;
    mix.sla[pointPhase(c, nowMs)] += 1;
  }

  const all = [...acc.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const clusters = all.slice(0, Math.max(1, cap));
  const rest = all.slice(clusters.length);
  return {
    axis,
    clusters,
    other: { groups: rest.length, count: rest.reduce((n, r) => n + r.count, 0) },
    unplaced,
  };
}

/** The instant, zero-request overview: the same clusters derived from the summary
 *  the module already handed the view. Returns `null` for the owner axis — the
 *  summary carries no ownership cross-tab, and inventing one would be worse than
 *  waiting one request. */
export function clustersFromSummary(
  summary: ContactSummary | null,
  axis: LandscapeAxis,
  cap: number = CLUSTER_CAP
): ClusterSet | null {
  if (!summary) return null;
  let rows: { key: string; count: number }[];
  if (axis === "source") rows = summary.bySource.map((r) => ({ key: r.label, count: r.count }));
  else if (axis === "region") rows = summary.byRegion.map((r) => ({ key: r.label, count: r.count }));
  else if (axis === "stage")
    rows = PIPELINE_STAGES.map((s) => ({ key: s, count: summary.byStage[s] ?? 0 })).filter(
      (r) => r.count > 0
    );
  else return null;

  const all = rows.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const clusters = all.slice(0, Math.max(1, cap)).map((r) => ({ key: r.key, count: r.count }));
  const rest = all.slice(clusters.length);
  const placed = all.reduce((n, r) => n + r.count, 0);
  return {
    axis,
    clusters,
    other: { groups: rest.length, count: rest.reduce((n, r) => n + r.count, 0) },
    unplaced: axis === "region" ? Math.max(0, summary.scanned - placed) : 0,
  };
}

/* ── deterministic placement ─────────────────────────────────────────────────── */

/** A stable 0–1 from a string (FNV-1a). The jitter source for point angles: it
 *  makes the layout reproducible without storing coordinates anywhere. */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

export interface PlacedCluster extends ClusterAgg {
  cx: number;
  cy: number;
  r: number;
}

/** The cluster size at which a disc earns the full canvas radius. Below it every
 *  disc shrinks proportionally, so the sample set reads as the small thing it is. */
export const FULL_SIZE_AT = 40;

export interface LayoutBox {
  width: number;
  height: number;
  minRadius?: number;
  maxRadius?: number;
  gap?: number;
}

/** Pack the clusters into the canvas box: area ∝ count (radius ∝ √count, so a
 *  cluster twice the size looks twice the size), biggest first, each one taking
 *  the free position nearest the middle — with a hashed directional preference so
 *  the arrangement is characterful per axis rather than a rigid ring.
 *
 *  A GREEDY GRID SCAN, not a physics simulation: a layout that settles differently
 *  on every mount is not a map. It is also total — a cluster that cannot fit at
 *  its ideal radius shrinks until it does, so the canvas can never silently drop a
 *  cluster the operator can see in the list beside it. */
export function layoutClusters(clusters: readonly ClusterAgg[], box: LayoutBox): PlacedCluster[] {
  const { width, height } = box;
  const minR = box.minRadius ?? 32;
  // The gap is generous because a cluster's LABEL lives outside its disc: pack the
  // circles tightly and the canvas turns into overlapping text.
  const gap = box.gap ?? 62;
  const max = clusters.reduce((m, c) => Math.max(m, c.count), 1);
  // Disc size is relative to the biggest cluster AND absolute: a six-contact
  // sample must not draw the same continent-sized discs a six-thousand-contact
  // project does, or the canvas silently flatters an empty pipeline.
  const ceiling = box.maxRadius ?? Math.min(width, height) * 0.26;
  const maxR = minR + (ceiling - minR) * Math.min(1, Math.sqrt(max / FULL_SIZE_AT));
  const cx0 = width / 2;
  const cy0 = height / 2;
  const stride = Math.max(8, Math.round(minR / 2));
  const out: PlacedCluster[] = [];

  for (const c of clusters) {
    const ideal = minR + (maxR - minR) * Math.sqrt(Math.min(1, c.count / max));
    const phase = hash01(c.key) * Math.PI * 2;
    let placed: PlacedCluster | null = null;

    for (let attempt = 0; attempt < 8 && !placed; attempt += 1) {
      const r = Math.max(8, ideal * 0.85 ** attempt);
      const lo = { x: r + gap, y: r + gap };
      const hi = { x: width - r - gap, y: height - r - gap };
      if (hi.x < lo.x || hi.y < lo.y) continue;
      let best: { cx: number; cy: number; score: number } | null = null;
      for (let x = lo.x; x <= hi.x + 0.001; x += stride) {
        for (let y = lo.y; y <= hi.y + 0.001; y += stride) {
          if (!out.every((o) => dist2(o.cx - x, o.cy - y) >= (o.r + r + gap) ** 2)) continue;
          const dx = x - cx0;
          const dy = y - cy0;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Nearest the middle wins; the hashed direction only breaks ties, so a
          // cluster never drifts to the rim just because of its name.
          const score = dist * (1 - 0.12 * Math.cos(Math.atan2(dy, dx) - phase));
          if (!best || score < best.score) best = { cx: x, cy: y, score };
        }
      }
      if (best) placed = { ...c, cx: best.cx, cy: best.cy, r };
    }

    out.push(placed ?? { ...c, cx: clamp(cx0, 8, width - 8), cy: clamp(cy0, 8, height - 8), r: 8 });
  }
  return out;
}

/** SEMANTIC zoom, not magnification. `zoom` runs 0 (overview) → 1 (individuals):
 *  the focused cluster grows toward the middle of the canvas while its neighbours
 *  drift outward, and nothing else changes size. Geometry stays in screen pixels,
 *  so labels, dots and stroke weights never need a `1/scale` correction and the
 *  canvas reads identically at both ends of the scrubber.
 *
 *  Pure and total: an unknown key is the overview, unchanged. */
export function focusLayout(
  placed: readonly PlacedCluster[],
  focusKey: string | null,
  zoom: number,
  box: { width: number; height: number }
): PlacedCluster[] {
  const z = Math.min(1, Math.max(0, zoom));
  if (!focusKey || z === 0 || !placed.some((p) => p.key === focusKey)) return [...placed];
  const cx0 = box.width / 2;
  const cy0 = box.height / 2;
  const focusR = Math.min(box.width, box.height) * 0.42;
  return placed.map((p) => {
    if (p.key === focusKey) {
      return {
        ...p,
        cx: lerp(p.cx, cx0, z),
        cy: lerp(p.cy, cy0, z),
        r: lerp(p.r, Math.max(p.r, focusR), z),
      };
    }
    const push = 1 + z * 1.1;
    return { ...p, cx: cx0 + (p.cx - cx0) * push, cy: cy0 + (p.cy - cy0) * push };
  });
}

/** Below this the canvas is an overview (clusters only); above it the focused
 *  cluster's individual dots fade in. One threshold, shared by the scrubber, the
 *  wheel and the cluster list, so all three agree what "zoomed in" means. */
export const EXPAND_ZOOM = 0.35;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
}
function dist2(dx: number, dy: number): number {
  return dx * dx + dy * dy;
}

/* ── points ──────────────────────────────────────────────────────────────────── */

/** Dots drawn for ONE expanded cluster. 400 is the prototype's honest ceiling:
 *  the canvas is SVG + framer-motion, which is comfortable to roughly a thousand
 *  live nodes and no further (WebGL is explicitly out of scope for this
 *  direction). Everything above the cap is disclosed as "+N dalších". */
export const POINT_CAP = 400;

/** The oldest age the radial scale resolves. Beyond it every dot sits on the rim —
 *  a single two-year-old contact must not squash a month of leads into the centre. */
export const MAX_AGE_DAYS = 180;

export interface LandscapePoint {
  id: string;
  name: string;
  grade: LeadGrade | null;
  stage: PipelineStage;
  slaPhase: SlaPhase;
  ageDays: number;
  /** unit-disk coordinates, −1..1; the canvas scales them by the cluster radius */
  x: number;
  y: number;
}

/** What a dot is called. An erased (GDPR-tombstoned) contact must never be
 *  rendered as a person, so it carries no name — the caller labels it. */
function displayName(c: Contact): string {
  if (c.erasedAt) return "";
  return (c.name || c.companyName || c.email || c.phone || "").trim();
}

/** Radial placement: centre = newest, rim = oldest. The age fraction is square-
 *  rooted so dots spread by AREA rather than piling up on the rim, and a hashed
 *  angle + small radial jitter keeps same-age contacts from stacking on one spoke. */
export function pointPosition(id: string, ageDays: number): { x: number; y: number } {
  const frac = Math.min(1, Math.max(0, ageDays / MAX_AGE_DAYS));
  const h = hash01(id);
  const jitter = (hash01(`${id}#r`) - 0.5) * 0.06;
  const r = Math.min(0.94, Math.max(0.06, 0.1 + 0.84 * Math.sqrt(frac) + jitter));
  const angle = h * Math.PI * 2;
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

export function ageDaysOf(c: Contact, nowMs: number): number {
  const seen = Date.parse(c.firstSeenAt);
  if (!Number.isFinite(seen)) return 0;
  return Math.max(0, (nowMs - seen) / 86_400_000);
}

/** Lay out one cluster's members. Newest first so the cap keeps the dots an
 *  operator actually acts on, and `truncated` states what the cap cost. */
export function layoutPoints(
  contacts: readonly Contact[],
  nowMs: number,
  cap: number = POINT_CAP
): { points: LandscapePoint[]; truncated: number } {
  const ordered = [...contacts].sort(
    (a, b) => ageDaysOf(a, nowMs) - ageDaysOf(b, nowMs) || a.id.localeCompare(b.id)
  );
  const kept = ordered.slice(0, Math.max(1, cap));
  const points = kept.map((c) => {
    const ageDays = ageDaysOf(c, nowMs);
    const { x, y } = pointPosition(c.id, ageDays);
    return {
      id: c.id,
      name: displayName(c),
      grade: c.score?.grade ?? null,
      stage: c.stage,
      slaPhase: pointPhase(c, nowMs),
      ageDays: Math.round(ageDays * 10) / 10,
      x,
      y,
    } satisfies LandscapePoint;
  });
  return { points, truncated: Math.max(0, ordered.length - kept.length) };
}

/* ── drill-down ──────────────────────────────────────────────────────────────── */

/** The NARROWEST `ContactQuery` that provably covers a lasso selection, or `null`
 *  when none does. `ContactQuery` can express a stage and a free-text needle and
 *  nothing else — so a mixed-stage selection of forty people has no honest filter,
 *  and the UI must disable the drill rather than open the table on a filter that
 *  shows the wrong set. Pure, so "is this button honest?" is a unit test. */
export function selectionQuery(points: readonly LandscapePoint[]): Partial<ContactQuery> | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    const name = points[0]!.name.trim();
    return name ? { search: name } : null;
  }
  // A shared stage is a SUPERSET filter — it lands the operator on a table that
  // provably contains every dot they lassoed. A mixed-stage selection has no such
  // filter, and a drill that quietly showed a different set would be worse than
  // a disabled button with an honest reason.
  const stages = new Set(points.map((p) => p.stage));
  if (stages.size === 1) return { stage: [...stages][0]! };
  return null;
}
