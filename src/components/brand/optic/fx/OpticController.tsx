"use client";

/** The landing's one scroll pipeline (ported from optic.js): a single rAF per
 *  scroll drives the bench camera and the later beats, plus the bench rail,
 *  the "travel the bench" cue, arrow keys between stations, and the mode
 *  switch when the viewport crosses the wide/compact line. Renders nothing:
 *  the markup it moves is server-rendered. */
import { useEffect } from "react";
import { createCamera } from "./camera";
import { createScrollFx } from "./scrollFx";

const WIDE = "(min-width:1100px) and (min-aspect-ratio:5/4)";
const REDUCED = "(prefers-reduced-motion: reduce)";

export default function OpticController() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".ob");
    if (!root || !root.querySelector("#ob-bench")) return;
    const wideQ = window.matchMedia(WIDE);
    const redQ = window.matchMedia(REDUCED);
    const cam = createCamera(root);
    const fx = createScrollFx(root);
    let ticking = false;
    let resizeT = 0;

    const update = () => {
      ticking = false;
      cam.onScroll();
      fx.update(wideQ.matches, redQ.matches);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    const onMode = () => {
      cam.setMode(wideQ.matches && !redQ.matches);
      fx.layoutConv();
      update();
    };
    const onResize = () => {
      window.clearTimeout(resizeT);
      resizeT = window.setTimeout(() => {
        cam.measure();
        fx.layoutConv();
        update();
      }, 80);
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-ob-go],[data-ob-jump]");
      if (!el || !root.contains(el)) return;
      e.preventDefault();
      cam.go(Number(el.dataset.obGo ?? 0));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (!cam.pinned || document.documentElement.classList.contains("ob-room-open")) return;
      const t = e.target as Element | null;
      if (t?.closest("input,textarea,select,.ob-hero") || !cam.inBench()) return;
      e.preventDefault();
      cam.go(cam.current() + (e.key === "ArrowRight" ? 1 : -1));
    };
    // a keyboard user tabbing into a station travels the camera to it
    const onFocusIn = (e: FocusEvent) => {
      const st = (e.target as Element | null)?.closest("[data-ob-station]");
      const i = st ? cam.indexOf(st) : -1;
      if (cam.pinned && i >= 0 && cam.current() !== i) cam.go(i, true);
    };

    onMode();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    root.addEventListener("click", onClick);
    root.addEventListener("focusin", onFocusIn);
    wideQ.addEventListener("change", onMode);
    redQ.addEventListener("change", onMode);
    void document.fonts?.ready.then(onResize);
    return () => {
      window.clearTimeout(resizeT);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      root.removeEventListener("click", onClick);
      root.removeEventListener("focusin", onFocusIn);
      wideQ.removeEventListener("change", onMode);
      redQ.removeEventListener("change", onMode);
      cam.destroy();
    };
  }, []);
  return null;
}
