"use client";

/** The hero's light: one canvas, the eight fan labels, the apex angle, and the
 *  two controls that steer it (skip intro, tilt the prism). The engine is a
 *  separate chunk, imported when the browser is idle, so the headline (the
 *  server-rendered children) paints first. The engine pauses off screen and in
 *  a hidden tab; reduced motion gets one static frame. */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { HERO_T } from "../copy/hero";
import { HUES } from "./engine/math";
import Arrow from "../Arrow";

const FAN_KEYS = ["fan0", "fan1", "fan2", "fan3", "fan4", "fan5", "fan6", "fan7"] as const;

export default function HeroOptics({ children }: { children: ReactNode }) {
  const t = useT(HERO_T);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLUListElement>(null);
  const apex = useRef<HTMLSpanElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const tilt = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const host = cv?.parentElement;
    if (!cv || !host || typeof IntersectionObserver === "undefined") return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    const go = () => {
      void import("./engine/mount").then(({ mountHero }) => {
        if (cancelled) return;
        destroy = mountHero({
          host,
          canvas: cv,
          labels: Array.from(labels.current?.children ?? []) as HTMLElement[],
          apex: apex.current,
          skip: skip.current,
          tilt: tilt.current,
          reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
      });
    };
    // Safari has no requestIdleCallback; a short timeout stands in for it
    const idle = "requestIdleCallback" in window;
    const handle = idle ? window.requestIdleCallback(go, { timeout: 1200 }) : window.setTimeout(go, 200);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      destroy?.();
    };
  }, []);

  return (
    <>
      <canvas ref={canvas} className="ob-optics" aria-hidden="true" />
      <ul ref={labels} className="ob-fan-labels" aria-hidden="true">
        {FAN_KEYS.map((k, i) => (
          <li key={k} style={{ "--h": HUES[i] } as CSSProperties}>
            {t(k)}
          </li>
        ))}
      </ul>
      <span ref={apex} className="ob-apex-tag" aria-hidden="true">
        60&deg;
      </span>
      {children}
      <button ref={skip} className="ob-skip-intro" type="button">
        {t("skipIntro")}
      </button>
      <button ref={tilt} className="ob-tilt" type="button" aria-label={t("tiltLabel")}>
        {t("tilt")} <Arrow dir="l" />
        <Arrow />
      </button>
    </>
  );
}
