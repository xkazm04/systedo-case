/** Optic Bench hero: canvas brushes for additive light (ported from hero.js). */
import { rgba, type Prism, type Pt, type RGB } from "./math";

const WARM: RGB = [255, 246, 232];

export function glowLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  core: string,
  widths: number[],
  alphas: number[]
) {
  ctx.lineCap = "round";
  for (let i = 0; i < widths.length; i++) {
    ctx.lineWidth = widths[i];
    ctx.strokeStyle = core;
    ctx.globalAlpha = alphas[i];
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A soft radial bloom. */
export function soft(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, rgb?: RGB) {
  if (r <= 0) return;
  const c = rgb ?? WARM;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(0.4, rgba(c, a * 0.32));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Anamorphic flare: a tiny hot core with a hairline horizontal streak. */
export function flare(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, rgb?: RGB) {
  soft(ctx, x, y, r * 0.42, a, rgb);
  const c = rgb ?? WARM;
  const len = r * 1.7;
  const g = ctx.createLinearGradient(x - len, y, x + len, y);
  g.addColorStop(0, rgba(c, 0));
  g.addColorStop(0.5, rgba(c, a * 0.9));
  g.addColorStop(1, rgba(c, 0));
  ctx.strokeStyle = g;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x - len, y);
  ctx.lineTo(x + len, y);
  ctx.stroke();
}

/** Trace the prism outline scaled by f about its centroid (path only). */
export function tri(ctx: CanvasRenderingContext2D, V: Prism, f: number, Cn: Pt, fresh = true) {
  const pts = [V.A, V.BL, V.BR];
  if (fresh) ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const x = Cn.x + (pts[i].x - Cn.x) * f;
    const y = Cn.y + (pts[i].y - Cn.y) * f;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}
