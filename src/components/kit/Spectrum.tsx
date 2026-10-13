/** A spectrum: shares of one whole split into spectral lines (ADR-0014) — the
 *  channel split on the Performance roof is its first tenant. One bar of hairline
 *  segments in the `chan-*` series colours, and under it a legend that states
 *  each share as a number, so the colour is never the only carrier. */

export interface SpectrumPart {
  label: string;
  value: number;
  /** Pre-formatted share or amount for the legend. */
  display: string;
}

export default function Spectrum({ parts, label }: { parts: SpectrumPart[]; label: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  return (
    <figure className="grid gap-3">
      <div role="img" aria-label={label} className="flex h-3 w-full gap-px overflow-hidden rounded-[2px] bg-hair">
        {total > 0
          ? parts.map((p, i) => (
              <span
                key={p.label}
                className="h-full"
                style={{
                  width: `${(Math.max(0, p.value) / total) * 100}%`,
                  background: `var(--color-chan-${i % 7})`,
                }}
              />
            ))
          : null}
      </div>
      <figcaption>
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {parts.map((p, i) => (
            <li key={p.label} className="flex items-center gap-2 text-sm">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: `var(--color-chan-${i % 7})` }} />
              <span className="truncate text-ink">{p.label}</span>
              <span className="ml-auto font-mono tabular-nums text-muted">{p.display}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
