import Link from "next/link";
import { ChevronRight } from "@/components/icons";
import type { Crumb } from "@/lib/nav";

/** Breadcrumb trail rendered as an ordered list for accessibility. The matching
 *  BreadcrumbList JSON-LD lives on the page so the visible trail and the
 *  structured data are built from the same `Crumb[]`. */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Drobečková navigace">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
        {items.map((crumb, i) => {
          const last = i === items.length - 1;
          return (
            <li key={crumb.href ?? crumb.label} className="flex items-center gap-x-1.5">
              {i > 0 && (
                <ChevronRight width={14} height={14} className="shrink-0 text-navy-300" aria-hidden />
              )}
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="rounded-sm transition-colors hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "max-w-[60vw] truncate font-medium text-navy-700 sm:max-w-md" : undefined}
                  title={last ? crumb.label : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
