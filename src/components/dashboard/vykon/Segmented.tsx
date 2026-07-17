"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Sliding-pill segmented control — a single background pill animates to the
 *  active option instead of snapping between buttons. Scrollable on narrow
 *  screens so it never widens the page. Shared by the period + chart-metric
 *  selectors.
 *
 *  Semantics: this is a value selector, not a tab strip, so each option is an
 *  honest `aria-pressed` toggle button (a normal Tab stop) rather than a
 *  `role="tab"` that would promise arrow-key navigation we don't implement. A
 *  disabled option stays focusable via `aria-disabled` so its reason (`title`)
 *  is announced instead of being unreachable behind `disabled`. */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const groupId = useId();

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
        role="group"
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
          // Keep a disabled option focusable (aria-disabled, not the `disabled`
          // attribute) and wire its reason to a visually-hidden node so keyboard
          // and touch users can actually read why it's off.
          const descId = o.disabled && o.title ? `${groupId}-${o.value}-desc` : undefined;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[o.value] = el;
              }}
              type="button"
              aria-pressed={active}
              aria-disabled={o.disabled || undefined}
              aria-describedby={descId}
              title={o.title}
              onClick={() => {
                if (!o.disabled) onChange(o.value);
              }}
              className={`relative z-10 shrink-0 rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
                o.disabled
                  ? "cursor-not-allowed text-muted/50"
                  : active
                    ? "text-navy-800"
                    : "text-muted hover:text-navy-700"
              }`}
            >
              {o.label}
              {descId && (
                <span id={descId} className="sr-only">
                  {o.title}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
