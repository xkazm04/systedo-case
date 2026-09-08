/** A SPECIMEN — the only card the exhibit has.
 *
 *  P4: a fact is displayed, not narrated. Every specimen is the same anatomy so
 *  the eye learns it once — a mono number, a one-line title, ONE visual, and a
 *  caption that may not run past two lines. The number is the ornament; there
 *  is no icon, no eyebrow, no button. The `span` is the card's place in the
 *  12-column gallery (the astra showcase's 7 / 5 / 4 rhythm), and on a phone
 *  every specimen becomes a catalogue row: number in a left rail, card beside it. */
import type { ReactNode } from "react";

const SPANS: Record<number, string> = {
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
  3: "lg:col-span-3",
};

export default function Specimen({
  n,
  of,
  title,
  caption,
  span = 4,
  children,
  className = "",
}: {
  n: number;
  of: number;
  title: string;
  caption: string;
  span?: keyof typeof SPANS;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`reveal-on-scroll grid grid-cols-[2.75rem_1fr] gap-3 content-start sm:grid-cols-1 sm:grid-rows-[auto_1fr] sm:gap-0 ${SPANS[span]} ${className}`}
    >
      {/* the catalogue rail on a phone; the corner label on a wall */}
      <p className="tnum pt-1 font-mono text-[12px] tracking-[0.16em] text-brand-300 sm:mb-3 sm:pt-0">
        {String(n).padStart(2, "0")}
        <span className="hidden text-onyx-muted sm:inline"> / {String(of).padStart(2, "0")}</span>
      </p>
      <div className="flex h-full flex-col overflow-hidden rounded-card border border-onyx-line bg-onyx-soft/40">
        <div className="min-h-0 flex-1">{children}</div>
        <div className="border-t border-onyx-line px-5 py-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-onyx-muted">{caption}</p>
        </div>
      </div>
    </article>
  );
}
