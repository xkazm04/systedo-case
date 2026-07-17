import { Logo } from "@/components/icons";

/** Static instant-shell for the authed project layout. Rendered as the Suspense
 *  fallback while the project (auth + Firestore) resolves, so entering a project
 *  paints the app frame immediately instead of blocking on the server round-trip.
 *  Free of any dynamic (locale / auth / project) reads so Cache Components can
 *  prerender it as the route's reusable shell.
 *
 *  Mirrors the real shell's rail geometry so revealing it doesn't shift layout:
 *  the total rail is 296px (AppSidebar's `RAIL_WIDTH = w-[296px]`), split into a
 *  74px icon strip (SectionRailNav's `w-[74px]`) plus the item panel. Keep these
 *  three literals in sync — if the rail width changes in AppSidebar/SectionRailNav,
 *  change it here too or the skeleton→shell handoff jumps. */
export default function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[296px] shrink-0 border-r border-line bg-surface md:flex">
        {/* first level — icon rail (matches SectionRailNav's w-[74px] strip) */}
        <div className="flex w-[74px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface p-2">
          <div className="mb-1 h-9 w-9 shrink-0 animate-pulse rounded-xl bg-line/70" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-11 w-full animate-pulse rounded-xl bg-line/40" />
          ))}
        </div>
        {/* second level — item panel */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-line p-3">
            <div className="h-9 w-full animate-pulse rounded-lg bg-line/70" />
          </div>
          <div className="flex-1 space-y-1 overflow-hidden p-2">
            <div className="mb-2 mt-1 h-3 w-24 rounded bg-line/60" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-full animate-pulse rounded-lg bg-line/40" />
            ))}
          </div>
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
