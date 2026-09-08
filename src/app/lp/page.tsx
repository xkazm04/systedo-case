import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { ArrowRight } from "@/components/icons";

/** THE REVIEW SHEET for the landing research — three live variants, one
 *  strategy each, and the columns the reviewer fills in.
 *
 *  `noindex`, linked from nowhere in the nav, and it carries the two things the
 *  retired `/lp` variants never had (docs/roadmap/landing-variants-retired.md):
 *  a DECISION DATE and a purpose beyond existing — each variant is a pure bet on
 *  one information-distribution strategy from docs/design/nextgen-landing.md,
 *  so walking them side by side isolates what works. If nothing is promoted by
 *  the date, all three are deleted rather than left to become scenery. */
export const metadata: Metadata = {
  title: "Landing research (internal)",
  robots: { index: false, follow: false },
};

const VARIANTS = [
  {
    href: "/lp/story",
    name: "Story",
    axis: "time",
    patterns: "P1 P2 P6 P10",
    bet: "One protagonist — a project — from a bare address to a running account. The scroll is the film; copy is captions; a pinned stage changes state as they pass.",
    watch: "Does the film hold attention to the numbers, and can a visitor say what the product does at the end?",
  },
  {
    href: "/lp/exhibit",
    name: "Exhibit",
    axis: "space",
    patterns: "P3 P4 P8 P11",
    bet: "Opens on the instrument itself, then every fact is a numbered specimen in an asymmetric gallery — a histogram, a contact sheet, a matrix, plates, a ledger. Deliberately still.",
    watch: "Do the specimens read without prose, and is the still page felt as calm or as inert?",
  },
  {
    href: "/lp/instrument",
    name: "Instrument",
    axis: "interaction",
    patterns: "P3 P7 P12 P5",
    bet: "A rail of the five project types; choosing one re-composes the readout, the switchboard and the plan. The product's own type-awareness is the landing mechanic.",
    watch: "Does operating the page beat reading it, and does the person recognise their own business in the rail?",
  },
] as const;

export default function LandingResearchPage() {
  return (
    <Container className="py-16">
      <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-brand-accent">Internal · landing research</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800">Three strategies, one page each</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">
        Same derived facts everywhere — the channel plan, the 90-day snapshot, the module registry, the five
        steps. What differs is how the information is distributed: by time, by space, or by interaction. The
        library the variants apply, with sources, is{" "}
        <code className="rounded bg-brand-50 px-1.5 py-0.5 text-sm text-brand-accent">docs/design/nextgen-landing.md</code>;
        the QA sheets are in <code className="rounded bg-brand-50 px-1.5 py-0.5 text-sm text-brand-accent">docs/design/qa/</code>.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        <strong className="font-semibold text-navy-800">Decision by 2026-10-08.</strong> Promote one strategy (or a
        deliberate fusion, written down) onto <code className="rounded bg-brand-50 px-1.5 py-0.5 text-sm text-brand-accent">/</code>{" "}
        and delete the rest, or delete all three. The shipped homepage stays at{" "}
        <Link href="/" className="text-brand-accent underline decoration-line underline-offset-4">/</Link> for comparison.
      </p>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              <th className="px-5 py-3 text-left font-normal">Variant</th>
              <th className="px-5 py-3 text-left font-normal">The bet</th>
              <th className="px-5 py-3 text-left font-normal">Watch for</th>
              <th className="px-5 py-3 text-left font-normal">Good</th>
              <th className="px-5 py-3 text-left font-normal">Bad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {VARIANTS.map((v) => (
              <tr key={v.href} className="align-top">
                <td className="px-5 py-5">
                  <Link href={v.href} className="group inline-flex items-center gap-2 text-base font-semibold text-navy-800">
                    {v.name}
                    <ArrowRight width={16} height={16} className="text-brand-accent transition-transform group-hover:translate-x-1" />
                  </Link>
                  <p className="mt-1 font-mono text-[12px] text-brand-accent">{v.href}</p>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                    {v.axis} · {v.patterns}
                  </p>
                </td>
                <td className="max-w-xs px-5 py-5 leading-relaxed text-muted">{v.bet}</td>
                <td className="max-w-xs px-5 py-5 leading-relaxed text-muted">{v.watch}</td>
                <td className="w-40 px-5 py-5 font-mono text-[12px] text-muted/60">—</td>
                <td className="w-40 px-5 py-5 font-mono text-[12px] text-muted/60">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
