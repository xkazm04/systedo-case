"use client";

/** THE FILM — the one client island of /lp/story.
 *
 *  P1 (docs/design/nextgen-landing.md): the scroll is a film of one protagonist.
 *  Bart gets the effect by cutting a generated video into frames and scrubbing
 *  them by scroll position; this gets it with no video at all. The STAGE is a
 *  sticky, viewport-tall layer that holds every scene's elements at once, all
 *  server-rendered; the CAPTIONS are a tall column that scrolls over it; and the
 *  only thing this file does is watch which caption is in the middle of the
 *  viewport and write its index to `data-scene` on the root. Every visual
 *  transition lives in globals.css under `.story-film[data-scene]`.
 *
 *  WHY AN OBSERVER AND NOT SCROLL MATHS. A scroll listener that divides scrollY
 *  by the section height is one resize away from being wrong, and it fires on
 *  every frame; an IntersectionObserver with a band through the viewport's
 *  middle fires only when the scene actually changes, needs no measurement, and
 *  keeps working when a caption is taller than expected on a narrow phone.
 *
 *  WHAT IT DOES WITH NO JS: `data-scene` stays at its server value (0), so the
 *  page shows the opening frame and every caption, and nothing is hidden that a
 *  reader needs — the captions carry the whole argument in text. */
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function StoryFilm({
  stage,
  captions,
  scenes,
}: {
  /** the pinned layer — server-rendered, every scene present */
  stage: ReactNode;
  /** the scrolling column; each direct child is one scene's caption */
  captions: ReactNode;
  scenes: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState(0);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-caption]"));
    if (targets.length === 0) return;

    // The band is the middle 20% of the viewport: a caption becomes the scene
    // when its box crosses it, and the previous scene stays until then, so the
    // stage never flickers between two states mid-scroll.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number((e.target as HTMLElement).dataset.caption);
          if (Number.isFinite(i)) setScene(Math.max(0, Math.min(scenes - 1, i)));
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [scenes]);

  return (
    <div ref={ref} className="story-film relative bg-onyx" data-scene={scene}>
      {/* P10 — the phone gets its own cut of the film: the stage pins in the top
          55svh and the subtitles run in the dark band beneath it. On a desk the
          stage is the whole viewport and the captions pull up over its left
          third, which the stage keeps clear. */}
      <div className="sticky top-0 z-20 h-[55svh] overflow-hidden sm:z-0 sm:h-svh" aria-hidden>
        {stage}
      </div>
      <div className="relative z-10 sm:-mt-[100svh]">{captions}</div>
    </div>
  );
}
