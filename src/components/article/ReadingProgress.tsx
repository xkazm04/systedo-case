"use client";

import { useEffect, useState } from "react";

/** Thin progress bar under the sticky nav that fills as the reader scrolls the
 *  page. Uses scaleX (no width reflow) and rAF-throttled scroll for smoothness. */
export default function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="fixed inset-x-0 top-16 z-40 h-0.5" aria-hidden>
      <div
        className="h-full origin-left bg-brand-500"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
