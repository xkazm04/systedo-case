import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { ArrowRight } from "@/components/icons";

/** Internal side-by-side index for the landing rebuild. `noindex`, linked from
 *  nowhere in the nav, and it carries the one thing the retired `/lp` variants
 *  never had: a DECISION DATE. If neither page has been promoted by then, this
 *  route and its sibling are deleted rather than left to become scenery
 *  (docs/roadmap/landing-variants-retired.md). */
export const metadata: Metadata = {
  title: "Landing comparison (internal)",
  robots: { index: false, follow: false },
};

const SURFACES = [
  {
    href: "/",
    name: "Shipped homepage",
    note: "BrandLanding — five sections, imagery in the hero only, motion on two bands.",
  },
  {
    href: "/lp/monolith",
    name: "Monolith rebuild",
    note: "Five named techniques, one per band; eleven Leonardo-generated assets; one client island.",
  },
];

export default function LandingComparisonPage() {
  return (
    <Container className="py-16">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-accent">Internal</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800">Landing comparison</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">
        Two live surfaces, same content and same claims, different design and motion layer. The
        rebuild&rsquo;s direction contract, technique menu and asset prompts are in{" "}
        <code className="rounded bg-brand-50 px-1.5 py-0.5 text-sm text-brand-accent">
          docs/ship/2026-09-08-landing-motion-rebuild.md
        </code>
        .
      </p>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
        <strong className="font-semibold text-navy-800">Decision by 2026-10-08.</strong> Promote one
        onto <code className="rounded bg-brand-50 px-1.5 py-0.5 text-sm text-brand-accent">/</code> and
        delete the other, or delete both of these routes. An unpromoted variant left alive is the exact
        failure the retired-variants note records.
      </p>

      <ul className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
        {SURFACES.map((s) => (
          <li key={s.href} className="bg-surface">
            <Link href={s.href} className="group block h-full px-6 py-7 transition-colors hover:bg-brand-50/50">
              <span className="flex items-center gap-2 text-lg font-semibold text-navy-800">
                {s.name}
                <ArrowRight
                  width={17}
                  height={17}
                  className="text-brand-accent transition-transform group-hover:translate-x-1"
                />
              </span>
              <span className="mt-1 block font-mono text-sm text-brand-accent">{s.href}</span>
              <span className="mt-3 block text-sm leading-relaxed text-muted">{s.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
