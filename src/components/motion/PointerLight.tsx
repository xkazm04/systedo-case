"use client";

/** POINTER LIGHT — a cursor-tracked light source for a marketing surface (P5 in
 *  docs/design/nextgen-landing.md: the cursor-tracking technique, minus the mascot).
 *
 *  The reference technique is a mascot whose eyes follow the pointer, with the
 *  eyes travelling FURTHER than the head; that offset between two layers is what
 *  reads as depth. DESIGN.md lists illustrated mascots as a confirmed
 *  anti-reference for this brand, so the same technique is applied to the thing
 *  this brand actually has: the light on the monument moves, the monument barely
 *  does. `.mono-glow` travels about four times as far as `.mono-mass` (globals.css).
 *
 *  WHY A CLIENT ISLAND AT ALL, when the other four techniques on this page hydrate
 *  nothing: a pointer has no CSS timeline. This is the only thing on the page that
 *  cannot be expressed as scroll progress, so it is the only thing that ships JS —
 *  and it ships about twenty lines of it, writing two custom properties.
 *
 *  THREE WAYS IT DECLINES TO RUN, all of them leaving a correct page:
 *   • prefers-reduced-motion — never attaches, and re-checks on change
 *   • a non-mouse pointer (touch, pen) — a finger is not a hover, and a jumping
 *     light on tap is worse than a still one
 *   • no JS at all — `--mx`/`--my` default to 0 in CSS, which is the centred,
 *     fully-composed hero. Nothing here is required to see the page. */
import { useEffect, useRef, type ReactNode } from "react";

export default function PointerLight({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    let frame = 0;
    let nx = 0;
    let ny = 0;

    const paint = () => {
      frame = 0;
      el.style.setProperty("--mx", nx.toFixed(3));
      el.style.setProperty("--my", ny.toFixed(3));
    };
    // One write per animation frame, not one per event: a pointer fires far more
    // often than the compositor paints, and the CSS transition is what smooths
    // the gaps anyway.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      schedule();
    };
    // Returning to rest is the same motion as arriving, so the light settles back
    // to centre rather than freezing wherever the pointer left the section.
    const onLeave = () => {
      nx = 0;
      ny = 0;
      schedule();
    };

    const attach = () => {
      el.addEventListener("pointermove", onMove, { passive: true });
      el.addEventListener("pointerleave", onLeave, { passive: true });
    };
    const detach = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      onLeave();
    };

    const sync = () => (reduce.matches ? detach() : attach());
    sync();
    reduce.addEventListener("change", sync);

    return () => {
      reduce.removeEventListener("change", sync);
      detach();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={`mono-track ${className}`}>
      {children}
    </div>
  );
}
