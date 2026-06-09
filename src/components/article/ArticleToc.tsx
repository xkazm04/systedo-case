"use client";

import { useEffect, useRef, useState } from "react";

interface TocItem {
  id: string;
  text: string;
}

/** Content-overview sidebar that tracks the section currently being read and
 *  slides a highlight to it. The IntersectionObserver is calibrated with a
 *  rootMargin band that starts just below the sticky nav and ends ~45 % down the
 *  viewport, so the "active" section is the one near the top of the reading area
 *  — not whatever merely touches the bottom of the screen. */
export default function ArticleToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (headings.length === 0) return;

    const inBand = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inBand.add(e.target.id);
          else inBand.delete(e.target.id);
        }
        // first heading (in document order) currently inside the band
        const current = items.find((i) => inBand.has(i.id));
        if (current) {
          setActive(current.id);
        } else {
          // nothing in the band: if we're at the very bottom, the last section
          // is the one being read (its heading has already scrolled past the top)
          const atBottom =
            window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
          if (atBottom) setActive(items[items.length - 1].id);
        }
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: [0, 1] }
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  // slide the highlight to the active item (and keep it aligned on resize)
  useEffect(() => {
    const measure = () => {
      const el = linkRefs.current[active];
      if (el) setIndicator({ top: el.offsetTop, height: el.offsetHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  return (
    <nav aria-label="Obsah článku" className="relative mt-4 border-l border-line">
      {indicator && (
        <span
          aria-hidden
          className="absolute -left-px w-0.5 rounded-full bg-brand-500 transition-all duration-300 ease-out"
          style={{ top: indicator.top, height: indicator.height }}
        />
      )}
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            ref={(el) => {
              linkRefs.current[item.id] = el;
            }}
            onClick={() => setActive(item.id)}
            aria-current={isActive ? "true" : undefined}
            className={`block py-1.5 pl-4 text-sm transition-colors ${
              isActive ? "font-medium text-navy-800" : "text-muted hover:text-navy-700"
            }`}
          >
            {item.text}
          </a>
        );
      })}
    </nav>
  );
}
