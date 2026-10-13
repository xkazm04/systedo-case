/** Optic Bench hero: the mutable scene and its layout (ported from hero.js).
 *  Wide = the 16:9 stage; compact = prism low, fan opening upward. */
import { clamp, TAU, type Geo, type RGB } from "./math";

export type Part = { l: number; s: number; off: number; sp: number; r: number; ph: number; soft: boolean };
export type Mote = { x: number; y: number; r: number; a: number; vx: number; vy: number; depth: number; c: RGB; ph: number };
export type FanLine = { ax: number; ay: number; bx: number; by: number; tx: number; ty: number; f: number; ak: number } | null;

export type Scene = {
  ctx: CanvasRenderingContext2D;
  cv: HTMLCanvasElement;
  host: HTMLElement;
  reduced: boolean;
  wide: boolean;
  W: number;
  H: number;
  DPR: number;
  u: number;
  G: Geo;
  tilt: number;
  target: number;
  lastPointer: number;
  kbHold: number;
  time: number;
  /** intro timeline, seconds; 99 = finished */
  tl: number;
  introDone: boolean;
  labelsOn: boolean;
  parts: Part[];
  motes: Mote[];
  fan: FanLine[];
  labels: HTMLElement[];
  apex: HTMLElement | null;
};

export function layout(s: Scene, wide: boolean) {
  s.W = s.host.clientWidth;
  s.H = s.host.clientHeight;
  s.DPR = Math.min(2, window.devicePixelRatio || 1);
  s.cv.width = Math.round(s.W * s.DPR);
  s.cv.height = Math.round(s.H * s.DPR);
  s.wide = wide;
  const { W, H } = s;
  if (wide) {
    const u = Math.min(W / 16, H / 9);
    const ox = (W - 16 * u) / 2;
    const oy = (H - 9 * u) / 2;
    s.u = u;
    s.G = { flip: false, side: 3.5 * u, cx: ox + 10.2 * u, cy: oy + 3.5 * u, beamY: oy + 3.22 * u, colX: ox + 14.0 * u, A0: -12, S: 60, aIn: 5.5, labelDX: 0.22 * u, ox, oy };
  } else {
    s.u = Math.min(W / 10, 64);
    const side = clamp(W * 0.36, 112, 210);
    const h = (side * Math.sqrt(3)) / 2;
    const cy = H - h * 0.95 - 20;
    s.G = { flip: true, side, cx: W * 0.4, cy, beamY: cy + h * 0.12, colX: W - 14, A0: -6, S: 46, aIn: 5.5, labelDX: 0, ox: 0, oy: 0 };
  }
  seedParts(s);
}

function seedParts(s: Scene) {
  s.parts.length = 0;
  s.motes.length = 0;
  if (s.reduced) return;
  const n = clamp(Math.round((s.W * s.H) / 17000), 36, 120);
  for (let i = 0; i < n; i++) {
    const soft = Math.random() < 0.2;
    s.parts.push({
      l: Math.random() < 0.3 ? -1 : Math.floor(Math.random() * 8),
      s: Math.random(),
      off: (Math.random() - 0.5) * 2,
      sp: 0.02 + Math.random() * 0.04,
      r: soft ? 3 + Math.random() * 4 : 0.5 + Math.random() * 1.2,
      ph: Math.random() * TAU,
      soft,
    });
  }
  const m = s.wide ? 8 : 5;
  const tints: (RGB | null)[] = [null, null, null, [255, 176, 0], null, [141, 123, 255], null, [82, 224, 212]];
  for (let i = 0; i < m; i++) {
    s.motes.push({
      x: Math.random() * s.W,
      y: Math.random() * s.H,
      r: s.wide ? s.u * (0.28 + Math.random() * 0.8) : s.W * (0.07 + Math.random() * 0.16),
      a: 0.022 + Math.random() * 0.035,
      vx: (Math.random() - 0.5) * 7,
      vy: (Math.random() - 0.5) * 3,
      depth: 0.4 + Math.random() * 1.2,
      c: tints[i % tints.length] ?? [255, 244, 228],
      ph: Math.random() * TAU,
    });
  }
}

/** Advance particles and motes by dt seconds. */
export function stepParticles(s: Scene, dt: number) {
  for (const p of s.parts) {
    p.s += p.sp * dt;
    if (p.s > 1) {
      p.s -= 1;
      p.off = (Math.random() - 0.5) * 2;
    }
  }
  for (const m of s.motes) {
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if (m.x < -m.r) m.x = s.W + m.r;
    if (m.x > s.W + m.r) m.x = -m.r;
    if (m.y < -m.r) m.y = s.H + m.r;
    if (m.y > s.H + m.r) m.y = -m.r;
  }
}
