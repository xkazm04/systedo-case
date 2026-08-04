import { getT } from "@/lib/i18n/server";

const T = {
  cs: { loading: "Načítání" },
  en: { loading: "Loading" },
} as const;

/** Instant static shell for the /dashboard demo — the Suspense fallback shown
 *  while the dynamic (searchParams-driven) module content streams in on first
 *  load. Mirrors DemoShell's frame so the paint is stable: the rail is 296px
 *  (DemoShell's `w-[296px]`) split into a 74px icon strip (SectionRailNav's
 *  `w-[74px]`) + item panel, and the topbar reserves the same justify-between
 *  actions row. Keep the width literals in sync with DemoShell/SectionRailNav so
 *  the skeleton→shell handoff doesn't jump. */
export default async function DemoShellSkeleton() {
  const t = await getT(T);
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside
        className="sticky top-0 hidden h-screen w-[296px] shrink-0 border-r border-line bg-surface md:flex"
        aria-hidden
      >
        {/* first level — icon rail (matches SectionRailNav's w-[74px] strip) */}
        <div className="flex w-[74px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface p-2">
          <div className="mb-1 h-9 w-9 shrink-0 animate-pulse rounded-xl bg-navy-50" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-11 w-full animate-pulse rounded-xl bg-navy-50" />
          ))}
        </div>
        {/* second level — item panel */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-line p-3">
            <div className="h-14 animate-pulse rounded-lg bg-navy-50" />
          </div>
          <div className="space-y-1 p-2">
            <div className="mb-2 mt-1 h-3 w-24 rounded bg-navy-50" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-navy-50" />
            ))}
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <div className="h-5 w-40 animate-pulse rounded bg-navy-50" />
          <div className="flex items-center gap-2" aria-hidden>
            <div className="h-7 w-20 animate-pulse rounded-pill bg-navy-50" />
            <div className="h-7 w-7 animate-pulse rounded-lg bg-navy-50" />
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center p-10">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand-500"
            role="status"
            aria-label={t("loading")}
          />
        </div>
      </div>
    </div>
  );
}
