/** An instrument panel: the kit's one container (ADR-0014). A faint wash, a
 *  hairline edge and four engraved corner ticks (`.optic-panel` in globals.css).
 *  Dense data gets its own panel; panels never nest. Server component. */
import type { ReactNode } from "react";

export default function Panel({
  title,
  aside,
  id,
  className = "",
  children,
}: {
  title?: string;
  /** Right-aligned head content: a period, a toggle, a provenance badge. */
  aside?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const headingId = id && title ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={`optic-panel px-4 py-4 sm:px-5 sm:py-5 ${className}`}>
      {title || aside ? (
        <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-5 gap-y-2">
          {title ? (
            <h3 id={headingId} className="text-base font-semibold text-ink">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {aside ? <div className="flex flex-wrap items-center justify-end gap-2">{aside}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
