import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { NAV_ITEMS, type NavItem } from "@/lib/nav";

/** A documentation-style prev/next pager (the Stripe / Docusaurus / GitBook
 *  pattern) that walks a reviewer through the case study in task order:
 *  Přehled → Dashboard → Článek → AI asistent → Kampaně. The sequence and the
 *  per-link blurbs are derived from NAV_ITEMS, so it never drifts from the
 *  header, footer or home cards.
 *
 *  Server component: each page passes its own route via `current`, which is all
 *  the pager needs to find its neighbours — no client-side `usePathname`. */
export default function TaskPager({ current }: { current: string }) {
  // Order the journey by the `task` field (0 = overview … 4 = bonus) rather than
  // relying on the NAV_ITEMS array order, so the pager stays correct even if the
  // array is ever reshuffled.
  const sequence = [...NAV_ITEMS].sort((a, b) => a.task - b.task);
  const index = sequence.findIndex((item) => item.href === current);
  if (index === -1) return null;

  const prev = sequence[index - 1];
  const next = sequence[index + 1];
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="Navigace případovou studií"
      className="mt-16 border-t border-line pt-10"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {next ? "Pokračujte případovou studií" : "Dokončili jste případovou studii"}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {prev && <PagerLink item={prev} direction="prev" />}
        {next ? <PagerLink item={next} direction="next" /> : <ClosingCta />}
      </div>
    </nav>
  );
}

/** Closing card shown on the last page instead of a dead-end empty slot: a short
 *  recap + a clear next step (back to the overview), so the highest-leverage
 *  conversion moment of a hiring-pitch case study doesn't just fizzle out. */
function ClosingCta() {
  return (
    <Link
      href="/"
      className="card group flex flex-col items-end gap-2 border-brand-200 bg-brand-50 p-5 text-right transition-all hover:-translate-y-0.5 hover:shadow-pop sm:col-start-2"
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
        Konec · děkuji za pozornost
        <ArrowRight
          width={14}
          height={14}
          className="transition-transform group-hover:translate-x-1"
          aria-hidden
        />
      </span>
      <span className="text-base font-semibold text-navy-800 transition-colors group-hover:text-brand-accent">
        Zpět na přehled
      </span>
      <span className="text-sm leading-relaxed text-muted">
        Prošli jste celou případovou studii — od výkonnostního dashboardu přes obsah a AI nástroje
        až po správu kampaní.
      </span>
    </Link>
  );
}

function PagerLink({ item, direction }: { item: NavItem; direction: "prev" | "next" }) {
  const isNext = direction === "next";
  return (
    <Link
      href={item.href}
      rel={isNext ? "next" : "prev"}
      className={`card group flex flex-col gap-2 p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop ${
        isNext ? "items-end text-right sm:col-start-2" : "items-start"
      }`}
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {!isNext && (
          <ArrowRight
            width={14}
            height={14}
            className="rotate-180 transition-transform group-hover:-translate-x-1"
            aria-hidden
          />
        )}
        {isNext ? "Další" : "Předchozí"}
        {isNext && (
          <ArrowRight
            width={14}
            height={14}
            className="transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        )}
      </span>
      <span className="text-base font-semibold text-navy-800 transition-colors group-hover:text-brand-accent">
        {item.label}
      </span>
      <span className="text-sm leading-relaxed text-muted">{item.blurb}</span>
    </Link>
  );
}
