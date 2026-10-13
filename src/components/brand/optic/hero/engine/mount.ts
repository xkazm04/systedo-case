/** Optic Bench hero: the loop, the inputs and the lifecycle (ported from
 *  hero.js). Pointer, touch drag, arrow keys and a slow idle drift tilt the
 *  prism. The loop pauses when the hero is off screen or the tab is hidden;
 *  reduced motion draws one static frame and only redraws on input. */
import { clamp } from "./math";
import { layout, stepParticles, type Scene } from "./scene";
import { drawLight } from "./drawLight";
import { drawGlass } from "./drawGlass";

export type HeroMount = {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  labels: HTMLElement[];
  apex: HTMLElement | null;
  skip: HTMLButtonElement | null;
  tilt: HTMLButtonElement | null;
  reduced: boolean;
};

const WIDE = "(min-width:1100px) and (min-aspect-ratio:5/4)";

export function mountHero(o: HeroMount): () => void {
  const ctx = o.canvas.getContext("2d");
  if (!ctx) return () => {};
  const wideQ = window.matchMedia(WIDE);
  const s: Scene = {
    ctx, cv: o.canvas, host: o.host, reduced: o.reduced, wide: wideQ.matches,
    W: 0, H: 0, DPR: 1, u: 60,
    G: { flip: false, side: 0, cx: 0, cy: 0, beamY: 0, colX: 0, A0: 0, S: 0, aIn: 0, labelDX: 0, ox: 0, oy: 0 },
    tilt: 0, target: 0, lastPointer: -1e9, kbHold: 0, time: 0,
    tl: o.reduced ? 99 : 0, introDone: o.reduced, labelsOn: false,
    parts: [], motes: [], fan: [], labels: o.labels, apex: o.apex,
  };
  let raf = 0;
  let last = 0;
  let visible = true;
  const timers: number[] = [];

  function draw() {
    ctx!.setTransform(s.DPR, 0, 0, s.DPR, 0, 0);
    ctx!.clearRect(0, 0, s.W, s.H);
    ctx!.globalCompositeOperation = "lighter";
    drawGlass(s, drawLight(s));
    ctx!.globalCompositeOperation = "source-over";
    if (!s.labelsOn && (s.reduced || s.tl > 2.05)) {
      s.labelsOn = true;
      s.labels.forEach((el, i) => {
        if (s.reduced || s.tl > 50) el.classList.add("is-on");
        else timers.push(window.setTimeout(() => el.classList.add("is-on"), i * 90));
      });
      o.apex?.classList.add("is-on");
    }
  }
  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    s.time += dt;
    if (!s.introDone) {
      s.tl += dt;
      if (s.tl >= 2.75) finishIntro();
    }
    if (now - s.lastPointer > 2600) s.target = Math.sin(s.time * 0.33) * 0.55 + Math.sin(s.time * 0.121 + 1.3) * 0.3;
    s.tilt += (s.target - s.tilt) * (1 - Math.exp(-dt * 3.4));
    stepParticles(s, dt);
    draw();
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (s.reduced) return;
    if (!raf && visible && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  function finishIntro() {
    if (s.introDone) return;
    s.introDone = true;
    s.tl = 99;
    o.skip?.classList.add("is-gone");
    s.labelsOn = false;
    s.labels.forEach((el) => (el.style.transitionDelay = "0s"));
  }
  function setTilt(v: number) {
    s.kbHold = clamp(v, -1, 1);
    s.target = s.kbHold;
    s.lastPointer = performance.now() + 5000;
    if (s.reduced) {
      s.tilt = s.target;
      draw();
    } else start();
  }

  const onMove = (e: PointerEvent) => {
    const x = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    s.target = clamp(x * 1.05, -1, 1);
    s.lastPointer = performance.now();
    s.kbHold = 0;
    start();
  };
  const onLeave = () => (s.lastPointer = performance.now() - 1800);
  const onDown = (e: PointerEvent) => {
    const t = e.target as Element | null;
    if (!s.introDone && !t?.closest("a,button")) finishIntro();
  };
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !s.introDone) finishIntro();
  };
  // arrow keys tilt the prism whenever focus is inside the hero
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    setTilt(s.kbHold + d * 0.34);
  };
  const onTilt = () => setTilt(s.kbHold >= 0.9 ? -1 : s.kbHold + 0.5);
  const onVis = () => {
    if (!document.hidden) start();
  };
  const relayout = () => {
    layout(s, wideQ.matches);
    if (s.reduced || !raf) draw();
  };

  o.host.addEventListener("pointermove", onMove, { passive: true });
  o.host.addEventListener("pointerleave", onLeave, { passive: true });
  o.host.addEventListener("pointerdown", onDown, { passive: true });
  o.host.addEventListener("keydown", onKey);
  o.skip?.addEventListener("click", finishIntro);
  o.tilt?.addEventListener("click", onTilt);
  window.addEventListener("keydown", onEsc);
  document.addEventListener("visibilitychange", onVis);
  wideQ.addEventListener("change", relayout);
  const ro = new ResizeObserver(relayout);
  ro.observe(o.host);
  const io = new IntersectionObserver((en) => {
    visible = en[0]?.isIntersecting ?? true;
    if (visible) start();
  });
  io.observe(o.host);

  layout(s, wideQ.matches);
  draw();
  start();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    timers.forEach((t) => clearTimeout(t));
    o.host.removeEventListener("pointermove", onMove);
    o.host.removeEventListener("pointerleave", onLeave);
    o.host.removeEventListener("pointerdown", onDown);
    o.host.removeEventListener("keydown", onKey);
    o.skip?.removeEventListener("click", finishIntro);
    o.tilt?.removeEventListener("click", onTilt);
    window.removeEventListener("keydown", onEsc);
    document.removeEventListener("visibilitychange", onVis);
    wideQ.removeEventListener("change", relayout);
    ro.disconnect();
    io.disconnect();
  };
}
