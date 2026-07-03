"use client";

import { useEffect, useState } from "react";
import { Close } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import {
  parseReadingPosition,
  readingPositionKey,
  remainingMinutes,
  shouldOfferResume,
  type ReadingPosition,
} from "./reading-resume";

const T = {
  cs: {
    resume: "Pokračovat ve čtení",
    remaining: "zbývá ~{n} min",
    dismiss: "Skrýt a číst od začátku",
  },
  en: {
    resume: "Continue reading",
    remaining: "~{n} min left",
    dismiss: "Dismiss and read from the top",
  },
} as const;

/** How often (at most) the reading position is persisted while scrolling. */
const SAVE_INTERVAL_MS = 500;
/** Once the reader has re-read this far on their own, the resume offer is moot. */
const AUTO_HIDE_PROGRESS = 0.3;

/** Thin progress bar under the sticky nav that fills as the reader scrolls the
 *  page. Uses scaleX (no width reflow) and rAF-throttled scroll for smoothness.
 *
 *  The same rAF handler now also remembers where the reader is (localStorage,
 *  keyed by pathname, throttled): a long article is read in multiple sittings,
 *  and on return a dismissible "Pokračovat ve čtení" chip offers to jump back —
 *  with the estimated minutes left when `readingMinutes` is provided. Saving
 *  only starts after a real scroll, so merely opening the page at the top never
 *  overwrites a previously stored position. */
export default function ReadingProgress({ readingMinutes }: { readingMinutes?: number }) {
  const t = useT(T);
  const [progress, setProgress] = useState(0);
  const [resume, setResume] = useState<ReadingPosition | null>(null);

  // Offer to resume BEFORE the persist handler below gets a chance to write —
  // reading storage in a mount effect keeps SSR + first client render identical.
  useEffect(() => {
    let pos: ReadingPosition | null = null;
    try {
      pos = parseReadingPosition(localStorage.getItem(readingPositionKey(window.location.pathname)));
    } catch {
      /* storage unavailable — no resume offer */
    }
    if (shouldOfferResume(pos, window.scrollY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResume(pos);
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    let scrolled = false;
    let lastSave = 0;
    const key = readingPositionKey(window.location.pathname);
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      setProgress(p);
      // Persist the position (throttled) — but only once the reader has
      // actually scrolled, so a fresh top-of-page load keeps the stored place.
      if (scrolled) {
        const now = Date.now();
        if (now - lastSave >= SAVE_INTERVAL_MS) {
          lastSave = now;
          try {
            localStorage.setItem(key, JSON.stringify({ y: Math.round(window.scrollY), p, ts: now }));
          } catch {
            /* storage unavailable — the progress bar still works */
          }
        }
      }
      raf = 0;
    };
    const onScroll = () => {
      scrolled = true;
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // A reader who ignored the chip and re-read a good chunk on their own has
  // implicitly declined — retire the offer instead of hovering forever.
  useEffect(() => {
    if (resume && progress > AUTO_HIDE_PROGRESS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResume(null);
    }
  }, [progress, resume]);

  const resumeReading = () => {
    if (!resume) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: resume.y, behavior: reduced ? "auto" : "smooth" });
    setResume(null);
  };

  return (
    <>
      <div data-testid="reading-progress" className="fixed inset-x-0 top-16 z-40 h-0.5 print:hidden" aria-hidden>
        <div
          className="h-full origin-left bg-brand-500"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      {resume && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 print:hidden">
          <div className="animate-drop flex items-center gap-1.5">
            <button
              type="button"
              onClick={resumeReading}
              className={buttonClass("onyx", "sm", { className: "shadow-pop" })}
            >
              {t("resume")}
              {readingMinutes !== undefined && (
                <span className="font-normal text-white/70">
                  · {t("remaining", { n: remainingMinutes(readingMinutes, resume.p) })}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setResume(null)}
              aria-label={t("dismiss")}
              title={t("dismiss")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-onyx text-white/80 shadow-pop transition-colors hover:text-white"
            >
              <Close width={14} height={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
