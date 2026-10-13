/** Optic Bench hero: the numbers and the geometry of one prism (no DOM).
 *  Ported from the contest variant's hero.js (ADR-0014). */

export type Pt = { x: number; y: number };
export type RGB = readonly [number, number, number];

/** The eight spectral lines, in fan order: one per module group. */
export const HUES = ["#FF4A4A", "#FF7A33", "#FFB000", "#E8E16A", "#7BE08A", "#52E0D4", "#4EA3FF", "#8D7BFF"] as const;
export const RGBS: RGB[] = HUES.map(
  (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const
);
export const TAU = Math.PI * 2;
export const RAD = Math.PI / 180;

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export const pt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Where the prism sits and how the fan opens, for one layout. */
export type Geo = {
  flip: boolean;
  side: number;
  cx: number;
  cy: number;
  beamY: number;
  colX: number;
  A0: number;
  S: number;
  aIn: number;
  labelDX: number;
  ox: number;
  oy: number;
};

export type Prism = { A: Pt; BL: Pt; BR: Pt; s: number; h: number };

export function prism(G: Geo, th: number): Prism {
  const s = G.side;
  const h = (s * Math.sqrt(3)) / 2;
  const sg = G.flip ? -1 : 1;
  const c = Math.cos(th);
  const si = Math.sin(th);
  const R = (x: number, y: number): Pt => ({ x: G.cx + x * c - y * si, y: G.cy + x * si + y * c });
  return { A: R(0, ((-2 * h) / 3) * sg), BL: R(-s / 2, (h / 3) * sg), BR: R(s / 2, (h / 3) * sg), s, h };
}

export function edgePointAtY(A: Pt, B: Pt, y: number): Pt {
  const t = clamp((y - A.y) / (B.y - A.y), 0.08, 0.92);
  return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
}

export function rayHit(P: Pt, ang: number, A: Pt, B: Pt): Pt {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const ex = B.x - A.x;
  const ey = B.y - A.y;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-6) return { x: B.x, y: B.y };
  const lam = ((A.x - P.x) * ey - (A.y - P.y) * ex) / den;
  return { x: P.x + dx * lam, y: P.y + dy * lam };
}
