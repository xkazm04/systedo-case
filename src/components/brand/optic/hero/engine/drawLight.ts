/** Optic Bench hero, first half of a frame: ambient bloom, the incoming beam,
 *  the bench scale, the glass body, the interior ray and the eight-line fan
 *  (ported from hero.js draw()). Returns what the second half needs. */
import { clamp, ease, edgePointAtY, lerp, prism, RAD, rayHit, rgba, RGBS, type Prism, type Pt } from "./math";
import { glowLine, soft, tri } from "./paint";
import type { Scene } from "./scene";

export type Frame = { V: Prism; bP: number; cP: number; P1: Pt; E: Pt; Cn: Pt; Mb: Pt; sg: number; qb: (t: number) => Pt };

export function drawLight(s: Scene): Frame {
  const { ctx, G, u, reduced, tl, tilt } = s;
  const th = tilt * 4.4 * RAD;
  const sg = G.flip ? -1 : 1;
  const V = prism(G, th);
  const bP = reduced ? 1 : ease(clamp(tl / 1.0, 0, 1));
  const cP = reduced ? 1 : ease(clamp((tl - 0.85) / 0.55, 0, 1));
  const P1 = edgePointAtY(V.A, V.BL, G.beamY);
  const aIn = sg * (G.aIn + tilt * 1.8) * RAD;
  const E = rayHit(P1, aIn, V.A, V.BR);
  const a0 = G.A0 + tilt * 3.2;
  const S = G.S + tilt * 5;
  const colX = G.colX;
  const Cn = { x: (V.A.x + V.BL.x + V.BR.x) / 3, y: (V.A.y + V.BL.y + V.BR.y) / 3 };
  const Mb = { x: (V.BL.x + V.BR.x) / 2, y: (V.BL.y + V.BR.y) / 2 };

  /* ambient bloom around the prism */
  soft(ctx, G.cx, G.cy, u * 4.6, 0.05 * cP, [255, 240, 220]);

  /* incoming beam, with a gentle flex toward the prism */
  const sx = -12;
  const sy = G.beamY;
  const cx1 = lerp(sx, P1.x, 0.62);
  const cy1 = sy + tilt * 0.1 * u;
  const qb = (t: number): Pt => {
    const a = 1 - t;
    return { x: a * a * sx + 2 * a * t * cx1 + t * t * P1.x, y: a * a * sy + 2 * a * t * cy1 + t * t * P1.y };
  };
  let prev = qb(0);
  for (let i = 1; i <= 12; i++) {
    const cur = qb((bP * i) / 12);
    const fade = clamp(((prev.x + cur.x) / 2 - sx) / (u * 1.6), 0.25, 1);
    glowLine(ctx, prev.x, prev.y, cur.x, cur.y, "rgb(255,247,235)", [16, 6.5, 2.6, 1.3], [0.04 * fade, 0.1 * fade, 0.5 * fade, fade]);
    prev = cur;
  }
  if (bP < 1 && !reduced) {
    const hp = qb(bP);
    soft(ctx, hp.x, hp.y, u * 0.6, 0.8);
  }

  /* engraved bench scale under the beam (wide) */
  if (s.wide) {
    const x0 = G.ox + 0.5 * u;
    const x1 = Math.min(P1.x - 0.5 * u, lerp(x0, P1.x, bP));
    const yb = G.beamY + u * 0.17;
    ctx.strokeStyle = "rgba(237,234,227,.26)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let xi = 0, xx = x0; xx < x1; xi++, xx += u * 0.12) {
      ctx.moveTo(xx, yb);
      ctx.lineTo(xx, yb + (xi % 5 === 0 ? 0.11 : 0.055) * u);
    }
    ctx.stroke();
  }

  /* prism glass: faint body + engraved bevel (hatched ring) */
  const gl = ctx.createLinearGradient(V.A.x, V.A.y, Mb.x, Mb.y);
  gl.addColorStop(0, `rgba(255,255,255,${0.11 * cP + 0.02})`);
  gl.addColorStop(1, `rgba(255,255,255,${0.02 * cP + 0.005})`);
  ctx.fillStyle = gl;
  tri(ctx, V, 1, Cn);
  ctx.fill();
  if (cP > 0.02) {
    ctx.save();
    tri(ctx, V, 1, Cn);
    tri(ctx, V, 0.9, Cn, false);
    ctx.clip("evenodd");
    ctx.strokeStyle = `rgba(237,234,227,${0.17 * cP})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const l = Math.min(V.A.x, V.BL.x, V.BR.x);
    const r = Math.max(V.A.x, V.BL.x, V.BR.x);
    const t = Math.min(V.A.y, V.BL.y, V.BR.y);
    const b = Math.max(V.A.y, V.BL.y, V.BR.y);
    for (let hx = l - (b - t); hx < r; hx += u * 0.085) {
      ctx.moveTo(hx, b);
      ctx.lineTo(hx + (b - t), t);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* interior light: refracted ray plus a faint ghost bounce off the base */
  if (cP > 0) {
    glowLine(ctx, P1.x, P1.y, lerp(P1.x, E.x, cP), lerp(P1.y, E.y, cP), "rgb(255,247,235)", [10, 3.6, 1.2], [0.07, 0.22, 0.85]);
    const Q = { x: lerp(V.BL.x, V.BR.x, 0.56), y: lerp(V.BL.y, V.BR.y, 0.56) };
    const k = clamp(((E.y - V.A.y) / (V.BR.y - V.A.y)) * (G.flip ? 1.14 : 0.86), 0.1, 0.9);
    const Rr = { x: lerp(V.A.x, V.BR.x, k), y: lerp(V.A.y, V.BR.y, k) };
    ctx.strokeStyle = `rgba(255,244,228,${0.15 * cP})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(P1.x, P1.y);
    ctx.lineTo(Q.x, Q.y);
    ctx.lineTo(Rr.x, Rr.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* fan: eight exact lines, soft white volume behind them */
  let fk0: Pt | null = null;
  let fk7: Pt | null = null;
  for (let k = 0; k < 8; k++) {
    const fk = reduced ? 1 : ease(clamp((tl - 1.05 - k * 0.07) / 0.85, 0, 1));
    if (fk <= 0) {
      s.fan[k] = null;
      continue;
    }
    const ak = lerp(sg * (a0 + S * 0.5) * RAD, sg * (a0 + (S * k) / 7) * RAD, fk);
    const T = { x: colX, y: E.y + Math.max(colX - E.x, u * 2) * Math.tan(ak) };
    const en = { x: lerp(E.x, T.x, fk), y: lerp(E.y, T.y, fk) };
    if (k === 0) fk0 = en;
    if (k === 7) fk7 = en;
    s.fan[k] = { ax: E.x, ay: E.y, bx: en.x, by: en.y, tx: T.x, ty: T.y, f: fk, ak };
  }
  if (fk0 && fk7) {
    const wg = ctx.createLinearGradient(E.x, E.y, colX, E.y);
    wg.addColorStop(0, `rgba(255,248,236,${0.06 * cP})`);
    wg.addColorStop(1, "rgba(255,248,236,0)");
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(E.x, E.y);
    ctx.lineTo(fk0.x, fk0.y);
    ctx.lineTo(fk7.x, fk7.y);
    ctx.closePath();
    ctx.fill();
  }
  for (let k = 0; k < 8; k++) {
    const fl = s.fan[k];
    if (!fl) continue;
    const c = RGBS[k];
    const gr = ctx.createLinearGradient(E.x, E.y, fl.tx, fl.ty);
    gr.addColorStop(0, "rgba(255,252,246,.95)");
    gr.addColorStop(0.11, rgba(c, 0.95));
    gr.addColorStop(0.72, rgba(c, 0.78));
    gr.addColorStop(1, rgba(c, 0.28));
    ctx.lineCap = "round";
    ctx.strokeStyle = gr;
    const ws = [11, 4.6, 1.5];
    const as = [0.07, 0.17, 1];
    for (let w = 0; w < 3; w++) {
      ctx.lineWidth = ws[w];
      ctx.globalAlpha = as[w];
      ctx.beginPath();
      ctx.moveTo(E.x, E.y);
      ctx.lineTo(fl.bx, fl.by);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (fl.f > 0.98) {
      const nx = -Math.sin(fl.ak);
      const ny = Math.cos(fl.ak);
      ctx.strokeStyle = rgba(c, 0.85);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(fl.tx + nx * u * 0.09, fl.ty + ny * u * 0.09);
      ctx.lineTo(fl.tx - nx * u * 0.09, fl.ty - ny * u * 0.09);
      ctx.stroke();
      soft(ctx, fl.tx, fl.ty, u * 0.28, 0.55, c);
    }
    const label = s.labels[k];
    if (s.wide && label) label.style.transform = `translate3d(${(fl.tx + G.labelDX).toFixed(1)}px,${fl.ty.toFixed(1)}px,0) translateY(-50%)`;
  }
  return { V, bP, cP, P1, E, Cn, Mb, sg, qb };
}
