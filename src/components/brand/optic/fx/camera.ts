/** The bench camera (ported from optic.js): while the bench is pinned, page
 *  scroll becomes a sideways camera move through the three stations, with
 *  parallax on the near plate and the far numeral, labels fading in on
 *  arrival, the fan lines growing, and the sample ad typing itself out. */
import { typeAd, finishAd } from "./typeAd";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

type St = { el: HTMLElement; near: HTMLElement | null; far: HTMLElement | null; cap: HTMLElement | null; labs: HTMLElement | null; fl: SVGElement[] };

export type Camera = ReturnType<typeof createCamera>;

export function createCamera(root: HTMLElement) {
  const bench = root.querySelector<HTMLElement>("#ob-bench")!;
  const pin = root.querySelector<HTMLElement>("#ob-bench-pin")!;
  const world = root.querySelector<HTMLElement>("#ob-world")!;
  const hint = root.querySelector<HTMLElement>("#ob-bench-hint");
  const stations: St[] = Array.from(root.querySelectorAll<HTMLElement>("[data-ob-station]")).map((el) => ({
    el,
    near: el.querySelector(".ob-st-near"),
    far: el.querySelector(".ob-st-far"),
    cap: el.querySelector(".ob-cap"),
    labs: el.querySelector(".ob-labs"),
    fl: Array.from(el.querySelectorAll<SVGElement>(".ob-fl,.ob-cl")),
  }));
  const rail = Array.from(root.querySelectorAll<HTMLElement>("[data-ob-go]"));
  const cam = { c: 0, target: 0, raf: 0, last: 0, top: 0, span: 1, vw: 1, vh: 1, active: -1 };
  let pinned = false;

  function metrics() {
    const navH = parseFloat(getComputedStyle(pin).top) || 0;
    cam.top = bench.getBoundingClientRect().top + window.scrollY - navH;
    cam.vh = pin.offsetHeight || window.innerHeight;
    cam.vw = pin.clientWidth || root.clientWidth;
    cam.span = Math.max(1, bench.offsetHeight - cam.vh);
  }
  function fromScroll() {
    const p = clamp((window.scrollY - cam.top) / cam.span, 0, 1);
    const raw = p * 2;
    const i = Math.min(1, Math.floor(raw));
    return i + smooth(0.26, 0.74, raw - i);
  }
  function apply(c: number) {
    const vw = cam.vw;
    world.style.transform = `translate3d(${(-c * vw).toFixed(2)}px,0,0)`;
    stations.forEach((s, i) => {
      const d = c - i;
      const ad = Math.abs(d);
      const arrive = clamp(1 - ad * 1.15, 0, 1);
      if (s.near) {
        s.near.style.transform = `translate3d(${(-d * vw * 0.3).toFixed(1)}px,0,0)`;
        s.near.style.opacity = clamp(1 - ad * 1.7, 0, 1).toFixed(3);
      }
      if (s.far) {
        s.far.style.transform = `translate3d(${(d * vw * 0.38).toFixed(1)}px,0,0)`;
        s.far.style.opacity = clamp(1 - ad * 1.1, 0, 1).toFixed(3);
      }
      const fade = clamp(1 - ad * 2.1, 0, 1).toFixed(3);
      if (s.cap) s.cap.style.opacity = fade;
      if (s.labs) s.labs.style.opacity = fade;
      s.fl.forEach((n, k) => n.style.setProperty("--g", clamp((arrive - 0.12 - k * 0.045) * 2.3, 0, 1).toFixed(3)));
    });
    const act = clamp(Math.round(c), 0, 2);
    if (act !== cam.active) setActive(act);
    if (hint) hint.style.opacity = String(clamp(1 - c * 3, 0, 1));
  }
  function setActive(i: number) {
    cam.active = i;
    stations.forEach((s, k) => s.el.classList.toggle("is-active", k === i));
    rail.forEach((b, k) => (k === i ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
    if (i === 2) typeAd(root);
  }
  function loop(now: number) {
    cam.raf = 0;
    const dt = cam.last ? Math.min(0.05, (now - cam.last) / 1000) : 0.016;
    cam.last = now;
    cam.c += (cam.target - cam.c) * (1 - Math.exp(-dt * 7.5));
    if (Math.abs(cam.target - cam.c) < 0.0008) cam.c = cam.target;
    apply(cam.c);
    if (cam.c !== cam.target) cam.raf = requestAnimationFrame(loop);
    else cam.last = 0;
  }
  function kick() {
    if (!cam.raf) {
      cam.last = 0;
      cam.raf = requestAnimationFrame(loop);
    }
  }
  function snap() {
    cam.target = fromScroll();
    cam.c = cam.target;
    apply(cam.c);
  }
  function reset() {
    stations.forEach((s) => {
      [s.near, s.far, s.cap, s.labs].forEach((n) => {
        if (n) {
          n.style.transform = "";
          n.style.opacity = "";
        }
      });
      s.fl.forEach((n) => n.style.removeProperty("--g"));
    });
    world.style.transform = "";
    pin.style.opacity = "";
  }

  return {
    get pinned() {
      return pinned;
    },
    setMode(next: boolean) {
      pinned = next;
      reset();
      metrics();
      cam.active = -1;
      if (pinned) snap();
      else finishAd(root);
    },
    measure() {
      metrics();
      if (pinned) snap();
    },
    onScroll() {
      if (!pinned) return;
      cam.target = fromScroll();
      kick();
      const lv = clamp((window.scrollY - (cam.top + cam.span)) / (window.innerHeight * 0.55), 0, 1);
      pin.style.opacity = lv > 0 ? (1 - lv).toFixed(3) : "";
    },
    /** Travel to station i (0-2): a scroll when pinned, scrollIntoView when stacked. */
    go(i: number, instant = false) {
      const n = clamp(i, 0, 2);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (pinned) {
        metrics();
        window.scrollTo({ top: Math.round(cam.top + (n / 2) * cam.span), behavior: instant || reduced ? "instant" : "smooth" });
        if (instant) snap();
      } else stations[n]?.el.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" });
    },
    current: () => Math.round(cam.target),
    inBench: () => window.scrollY > cam.top - cam.vh * 0.3 && window.scrollY < cam.top + cam.span + cam.vh * 0.3,
    indexOf: (el: Element) => stations.findIndex((s) => s.el === el),
    destroy() {
      if (cam.raf) cancelAnimationFrame(cam.raf);
      finishAd(root);
    },
  };
}
