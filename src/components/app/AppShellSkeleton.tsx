import { Logo } from "@/components/icons";

/** Static instant-shell for the authed project layout. Rendered as the Suspense
 *  fallback while the project (auth + Firestore) resolves, so entering a project
 *  paints the app frame immediately instead of blocking on the server round-trip.
 *  Free of any dynamic (locale / auth / project) reads so Cache Components can
 *  prerender it as the route's reusable shell. Mirrors AppShell's rail geometry
 *  (w-64, md-and-up) so revealing the real shell doesn't shift layout. */
export default function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-surface md:flex md:flex-col">
        <div className="border-b border-line p-3">
          <div className="h-9 w-full animate-pulse rounded-lg bg-line/70" />
        </div>
        <div className="flex-1 space-y-6 overflow-hidden p-3">
          {Array.from({ length: 3 }).map((_, s) => (
            <div key={s} className="space-y-2">
              <div className="h-3 w-24 rounded bg-line/60" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 w-full animate-pulse rounded-lg bg-line/40" />
              ))}
            </div>
          ))}
        </div>
      </aside>
      <div
        role="status"
        className="animate-loading-reveal flex min-h-screen flex-1 items-center justify-center"
      >
        <Logo width={44} height={44} className="animate-loading-pulse text-brand-600" aria-hidden />
        <span className="sr-only">Načítání aplikace… · Loading…</span>
      </div>
    </div>
  );
}
