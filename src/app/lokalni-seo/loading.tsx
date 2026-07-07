import { Container } from "@/components/ui";

/** Route-level skeleton for /lokalni-seo — mirrors the real showcase shell (hero
 *  text column + demo card, then the three chart cards) so there's no layout
 *  jump when the page swaps in. The reveal holds opacity 0 for the first ~200ms
 *  so fast navigations never flash the skeleton (see globals.css). */
export default function Loading() {
  return (
    <div className="animate-loading-reveal">
      {/* Hero */}
      <section className="border-b border-line">
        <Container className="py-14 lg:py-20">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="animate-loading-pulse space-y-4">
              <div className="h-4 w-32 rounded bg-line" />
              <div className="h-12 w-full max-w-md rounded bg-line" />
              <div className="h-4 w-full max-w-lg rounded bg-line" />
              <div className="h-4 w-3/4 max-w-md rounded bg-line" />
              <div className="flex gap-3 pt-2">
                <div className="h-11 w-40 rounded-pill bg-line" />
                <div className="h-11 w-32 rounded-pill bg-line" />
              </div>
            </div>
            <div className="animate-loading-pulse aspect-[16/10] rounded-card border border-line bg-line/40" />
          </div>
        </Container>
      </section>

      {/* Charts */}
      <section>
        <Container className="py-14 lg:py-20">
          <div className="animate-loading-pulse space-y-3">
            <div className="h-4 w-36 rounded bg-line" />
            <div className="h-8 w-full max-w-md rounded bg-line" />
          </div>
          <div className="mt-9 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-card border border-line bg-surface p-5 shadow-card">
                <div className="animate-loading-pulse space-y-3">
                  <div className="h-4 w-2/3 rounded bg-line" />
                  <div className="h-3 w-full rounded bg-line" />
                  <div className="mt-4 h-52 rounded bg-line/50" />
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
