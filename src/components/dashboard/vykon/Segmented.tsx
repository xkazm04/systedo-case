"use client";

import { useEffect, useRef, useState } from "react";

/** Sliding-pill segmented control — a single background pill animates to the
 *  active tab instead of snapping between buttons. Scrollable on narrow screens
 *  so it never widens the page. Shared by the period + chart-metric selectors. */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  // Re-measure on value change and on resize.
  useEffect(() => {
    const el = refs.current[value];
    if (!el) return;
    const measure = () => setPill({ left: el.offsetLeft, width: el.offsetWidth });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, options]);

  return (
    <div className="max-w-full overflow-x-auto no-scrollbar">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="relative inline-flex w-max rounded-pill bg-navy-50 p-1"
      >
        {pill && (
          <span
            aria-hidden
            className="absolute bottom-1 top-1 rounded-pill bg-surface shadow-card transition-all duration-300 ease-out"
            style={{ left: pill.left, width: pill.width }}
          />
        )}
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[o.value] = el;
              }}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.value)}
              className={`relative z-10 shrink-0 rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active ? "text-navy-800" : "text-muted hover:text-navy-700"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
