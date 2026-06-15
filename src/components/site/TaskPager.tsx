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
        Pokračujte případovou studií
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {prev && <PagerLink item={prev} direction="prev" />}
        {next && <PagerLink item={next} direction="next" />}
      </div>
    </nav>
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
