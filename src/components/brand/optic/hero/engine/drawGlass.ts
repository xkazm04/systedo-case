/** Optic Bench hero, second half of a frame: flares, the engraved prism edges
 *  with chromatic fringe, ticks and dimension, travelling glints, the intro
 *  flash, haze particles and out-of-focus motes (ported from hero.js draw()). */
import { clamp, pt, rgba, RGBS, TAU, type RGB } from "./math";
import { flare, soft, tri } from "./paint";
import type { Scene } from "./scene";
import type { Frame } from "./drawLight";

export function drawGlass(s: Scene, f: Frame) {
  const { ctx, u, reduced, tl, tilt, time } = s;
  const { V, cP, P1, E, Cn, Mb, sg, bP, qb } = f;

  /* flares where light enters and leaves the glass */
  flare(ctx, P1.x, P1.y, u * 0.7, 0.5 * cP);
  flare(ctx, E.x, E.y, u * 0.85, 0.6 * cP);

  /* prism edges: engraved double line, chromatic fringe, ticks, dimension */
  ctx.lineJoin = "miter";
  ctx.lineWidth = 1.3;
  for (const [dx, col] of [[-1.1, `rgba(255,74,74,${0.22 * cP})`], [1.1, `rgba(78,163,255,${0.24 * cP})`]] as const) {
    ctx.strokeStyle = col;
    ctx.save();
    ctx.translate(dx, 0);
    tri(ctx, V, 1, Cn);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = `rgba(237,234,227,${0.2 + 0.44 * cP})`;
  tri(ctx, V, 1, Cn);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(237,234,227,${0.3 * cP})`;
  tri(ctx, V, 0.9, Cn);
  ctx.stroke();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = `rgba(237,234,227,${0.16 * cP})`;
  tri(ctx, V, 0.78, Cn);
  ctx.stroke();
  ctx.setLineDash([]);

  const bx = V.BR.x - V.BL.x;
  const by = V.BR.y - V.BL.y;
  const bl = Math.hypot(bx, by);
  const ux = bx / bl;
  const uy = by / bl;
  let nx0 = uy * sg;
  let ny0 = -ux * sg;
  if (nx0 * (Mb.x - Cn.x) + ny0 * (Mb.y - Cn.y) < 0) {
    nx0 = -nx0;
    ny0 = -ny0;
  }
  ctx.strokeStyle = `rgba(237,234,227,${0.34 * cP})`;
  const tickN = Math.floor(bl / (u * 0.13));
  ctx.beginPath();
  for (let t = 1; t < tickN; t++) {
    const px = V.BL.x + (ux * bl * t) / tickN;
    const py = V.BL.y + (uy * bl * t) / tickN;
    const len = (t % 5 === 0 ? 0.13 : 0.07) * u;
    ctx.moveTo(px + nx0 * u * 0.06, py + ny0 * u * 0.06);
    ctx.lineTo(px + nx0 * (u * 0.06 + len), py + ny0 * (u * 0.06 + len));
  }
  ctx.stroke();
  if (s.wide) {
    const off = u * 0.5;
    ctx.strokeStyle = `rgba(237,234,227,${0.5 * cP})`;
    ctx.beginPath();
    ctx.moveTo(V.BL.x + nx0 * off, V.BL.y + ny0 * off);
    ctx.lineTo(V.BR.x + nx0 * off, V.BR.y + ny0 * off);
    for (const P of [V.BL, V.BR]) {
      ctx.moveTo(P.x + nx0 * u * 0.12, P.y + ny0 * u * 0.12);
      ctx.lineTo(P.x + nx0 * (off + u * 0.1), P.y + ny0 * (off + u * 0.1));
    }
    ctx.stroke();
    const aL = Math.atan2(V.BL.y - V.A.y, V.BL.x - V.A.x);
    const aR = Math.atan2(V.BR.y - V.A.y, V.BR.x - V.A.x);
    ctx.beginPath();
    ctx.arc(V.A.x, V.A.y, u * 0.34, Math.min(aL, aR), Math.max(aL, aR), false);
    ctx.stroke();
    if (s.apex) s.apex.style.transform = `translate3d(${(V.A.x + u * 0.46).toFixed(1)}px,${(V.A.y + u * 0.22).toFixed(1)}px,0)`;
  }

  /* glints that travel the glass edges, plus a slow shine inside the glass */
  if (cP > 0.05) {
    const edges = [[V.A, V.BL], [V.A, V.BR], [V.BL, V.BR]] as const;
    edges.forEach(([p, q], e) => {
      const sp = (((time * 0.07 + tilt * 0.55 + e * 0.37) % 1) + 1) % 1;
      const g1 = pt(p, q, clamp(sp - 0.1, 0, 1));
      const g2 = pt(p, q, clamp(sp + 0.1, 0, 1));
      line(s, g1.x, g1.y, g2.x, g2.y, 0.9 * cP, 2.2);
    });
    const ss = 0.34 + 0.28 * Math.sin(time * 0.21 + 1) + tilt * 0.22;
    const sa = pt(V.A, V.BL, clamp(ss - 0.12, 0.05, 0.95));
    const sb = pt(V.A, V.BL, clamp(ss + 0.12, 0.05, 0.95));
    const a2 = pt(sa, Cn, 0.1);
    const b2 = pt(sb, Cn, 0.1);
    line(s, a2.x, a2.y, b2.x, b2.y, 0.38 * cP, 1.4);
  }
  if (!reduced && tl > 0.85 && tl < 1.7) {
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * Math.sin(clamp((tl - 0.85) / 0.85, 0, 1) * Math.PI)})`;
    ctx.lineWidth = 2.4;
    tri(ctx, V, 1, Cn);
    ctx.stroke();
  }
  if (reduced) return;

  /* haze particles drifting along the light (crisp motes + a few soft ones) */
  for (const p of s.parts) {
    let x: number;
    let y: number;
    let col: RGB = [255, 246, 232];
    if (p.l < 0) {
      const q = qb(clamp(p.s * bP, 0, 1));
      if (q.x < 2) continue;
      x = q.x;
      y = q.y + u * 0.22 * p.off;
    } else {
      const ln = s.fan[p.l];
      if (!ln || ln.f < 0.2) continue;
      const dx = ln.bx - ln.ax;
      const dy = ln.by - ln.ay;
      const dl = Math.hypot(dx, dy) || 1;
      const spread = u * (0.05 + p.s * 0.16) * p.off;
      x = ln.ax + dx * p.s - (dy / dl) * spread;
      y = ln.ay + dy * p.s + (dx / dl) * spread;
      col = RGBS[p.l];
    }
    const al = Math.pow(Math.sin(Math.PI * p.s), 0.8) * (0.35 + 0.35 * Math.sin(time * 0.9 + p.ph));
    if (p.soft) soft(ctx, x, y, p.r * 2.2, clamp(al * 0.32, 0, 0.2), col);
    else {
      ctx.fillStyle = rgba(col, clamp(al, 0, 0.7));
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, TAU);
      ctx.fill();
    }
  }
  /* out-of-focus foreground motes: big, slow, barely there */
  for (const m of s.motes) {
    const mx = m.x + tilt * m.depth * s.W * 0.035;
    const my = m.y + Math.sin(time * 0.2 + m.ph) * u * 0.15;
    const ma = m.a * (0.7 + 0.3 * Math.sin(time * 0.35 + m.ph)) * cP;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, m.r);
    mg.addColorStop(0, rgba(m.c, ma * 0.5));
    mg.addColorStop(0.72, rgba(m.c, ma));
    mg.addColorStop(0.9, rgba(m.c, ma * 0.7));
    mg.addColorStop(1, rgba(m.c, 0));
    ctx.fillStyle = mg;
    ctx.fillRect(mx - m.r, my - m.r, m.r * 2, m.r * 2);
  }
}

/** A white highlight that fades out at both ends. */
function line(s: Scene, x1: number, y1: number, x2: number, y2: number, a: number, w: number) {
  const { ctx } = s;
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, `rgba(255,255,255,${a})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = g;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
