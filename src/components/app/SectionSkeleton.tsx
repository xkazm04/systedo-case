/** Placeholder shown while a lazily-loaded (next/dynamic) module section streams
 *  its JS chunk in. Reserves height so the swap to real content doesn't shift the
 *  page — important because layout jumps would fight the staggered section reveal.
 *  Pure presentational, no client state, so it can be a Suspense/dynamic fallback
 *  without itself suspending. Matches the app's skeleton vocabulary (animate-pulse
 *  over `bg-line`), and the global reduced-motion block already stills the pulse. */
export default function SectionSkeleton({
  className = "",
  /** Rough height of the real section, so the reserved box matches it. */
  height = "h-64",
  lines = 3,
}: {
  className?: string;
  height?: string;
  lines?: number;
}) {
  return (
    <div
      className={`card ${height} animate-pulse p-6 ${className}`}
      aria-hidden="true"
    >
      <div className="h-4 w-40 rounded bg-line/70" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-line/60"
            style={{ width: `${90 - i * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}
