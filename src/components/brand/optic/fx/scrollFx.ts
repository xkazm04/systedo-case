/** Scroll-driven beats after the bench (ported from optic.js update()):
 *  the hall's camera pull-back and lamps dropping in, the apertures lighting
 *  one by one as the beam widens, and the eight lines reconverging on the
 *  closing action. Reduced motion: everything shown, nothing moves. */
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const CONV_Y = [0.04, 0.26, 0.5, 0.78, 0.08, 0.3, 0.56, 0.86];

export function createScrollFx(root: HTMLElement) {
  const hall = root.querySelector<HTMLElement>("#ob-hall");
  const hallStage = root.querySelector<HTMLElement>("#ob-hall-stage");
  const path = root.querySelector<HTMLElement>("#ob-path");
  const aps = Array.from(root.querySelectorAll<HTMLElement>(".ob-ap"));
  const close = root.querySelector<HTMLElement>("#ob-close");
  const conv = root.querySelector<SVGSVGElement>("#ob-conv");
  const lines = conv ? Array.from(conv.querySelectorAll<SVGLineElement>("line")) : [];
  const point = root.querySelector<HTMLElement>("[data-ob-point]");

  function layoutConv() {
    if (!close || !conv || !point) return;
    const sr = close.getBoundingClientRect();
    const br = point.getBoundingClientRect();
    const W = sr.width;
    const H = sr.height;
    const tx = br.left - sr.left + br.width / 2;
    const ty = br.top - sr.top + br.height / 2;
    conv.setAttribute("viewBox", `0 0 ${W} ${H}`);
    conv.setAttribute("preserveAspectRatio", "none");
    lines.forEach((ln, k) => {
      const x1 = k < 4 ? -20 : W + 20;
      const y1 = CONV_Y[k] * H;
      ln.setAttribute("x1", String(x1));
      ln.setAttribute("y1", String(y1));
      ln.setAttribute("x2", String(tx));
      ln.setAttribute("y2", String(ty));
      ln.style.transformOrigin = `${x1}px ${y1}px`;
    });
  }

  function update(wide: boolean, reduced: boolean) {
    const vh = window.innerHeight;
    if (hall && hallStage) {
      const top = hall.getBoundingClientRect().top;
      if (wide) {
        const p = clamp(1 - top / vh, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        hallStage.style.setProperty("--hs", reduced ? "1" : (1.2 + (1 - 1.2) * e).toFixed(4));
        hall.classList.toggle("is-in", top < vh * 0.72);
      } else {
        hallStage.style.removeProperty("--hs");
        hall.classList.toggle("is-in", top < vh * 0.85);
      }
    }
    if (path) {
      const top = path.getBoundingClientRect().top;
      const bp = wide ? clamp((vh * 0.95 - top) / (vh * 0.72), 0, 1) : 1;
      path.style.setProperty("--bp", reduced ? "1" : bp.toFixed(3));
      aps.forEach((ap, i) => {
        const on = reduced || (wide ? bp > 0.1 + i * 0.17 : ap.getBoundingClientRect().top < vh * 0.85);
        ap.classList.toggle("is-on", on);
      });
    }
    if (close) {
      const p = reduced ? 1 : clamp((vh * 0.98 - close.getBoundingClientRect().top) / (vh * 0.7), 0, 1);
      lines.forEach((ln, k) => (ln.style.transform = `scale(${clamp(p * 1.5 - k * 0.06, 0, 1).toFixed(3)})`));
    }
  }

  return { layoutConv, update };
}
