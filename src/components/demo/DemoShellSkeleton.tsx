/** Instant static shell for the /dashboard demo — the Suspense fallback shown
 *  while the dynamic (searchParams-driven) module content streams in on first
 *  load. Mirrors DemoShell's frame so the paint is stable. */
export default function DemoShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside
        className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-surface md:block"
        aria-hidden
      >
        <div className="animate-pulse space-y-5 p-4">
          <div className="h-9 w-36 rounded-lg bg-navy-50" />
          <div className="h-14 rounded-lg bg-navy-50" />
          <div className="space-y-2 pt-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-8 rounded-lg bg-navy-50" />
            ))}
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-line bg-surface px-4 sm:px-6">
          <div className="h-5 w-40 animate-pulse rounded bg-navy-50" />
        </header>
        <div className="flex flex-1 items-center justify-center p-10">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand-500"
            role="status"
            aria-label="Loading"
          />
        </div>
      </div>
    </div>
  );
}
