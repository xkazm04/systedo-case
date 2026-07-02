import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { localizedNavItems, type NavItem } from "@/lib/nav";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

/** A documentation-style prev/next pager (the Stripe / Docusaurus / GitBook
 *  pattern) that walks a reviewer through the case study in task order:
 *  Přehled → Dashboard → Článek → AI asistent → Kampaně. The sequence and the
 *  per-link blurbs are derived from NAV_ITEMS, so it never drifts from the
 *  header, footer or home cards.
 *
 *  Server component: each page passes its own route via `current`, which is all
 *  the pager needs to find its neighbours — no client-side `usePathname`. */

const T = {
  cs: {
    ariaLabel: "Navigace případovou studií",
    continue: "Pokračujte případovou studií",
    finished: "Dokončili jste případovou studii",
    position: "Úkol {index} ze {total}",
    closingTag: "Konec · děkuji za pozornost",
    closingHeading: "Zpět na přehled",
    closingBody:
      "Prošli jste celou případovou studii — od výkonnostního dashboardu přes obsah a AI nástroje až po správu kampaní.",
    next: "Další",
    prev: "Předchozí",
  },
  en: {
    ariaLabel: "Case-study navigation",
    continue: "Continue through the case study",
    finished: "You've completed the case study",
    position: "Task {index} of {total}",
    closingTag: "Done · thank you for your time",
    closingHeading: "Back to overview",
    closingBody:
      "You've walked the full case study — from the performance dashboard through content and AI tools to campaign management.",
    next: "Next",
    prev: "Previous",
  },
} as const;

type TKeys = keyof (typeof T)["cs"];
type TFn = (key: TKeys, vars?: Record<string, string | number>) => string;

export default async function TaskPager({ current }: { current: string }) {
  const t = await getT(T);
  const locale = await getServerLocale();

  // Order the journey by the `task` field (0 = overview … 4 = bonus) rather than
  // relying on the NAV_ITEMS array order, so the pager stays correct even if the
  // array is ever reshuffled.
  const sequence = [...localizedNavItems(locale)].sort((a, b) => a.task - b.task);
  const index = sequence.findIndex((item) => item.href === current);
  if (index === -1) return null;

  const prev = sequence[index - 1];
  const next = sequence[index + 1];
  if (!prev && !next) return null;

  // Journey position, counted over the task pages only (task 0 = the overview
  // rozcestník, which the mobile menu's "Úkol N" badges also exclude). The
  // dots are decorative — the visible "Úkol N ze M" text carries the meaning.
  const step = sequence[index].task;
  const tasks = sequence.filter((item) => item.task > 0);

  return (
    <nav
      aria-label={t("ariaLabel")}
      className="mt-16 border-t border-line pt-10"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          {next ? t("continue") : t("finished")}
        </p>
        {step > 0 && (
          <p className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            <span>{t("position", { index: step, total: tasks.length })}</span>
            <span className="flex items-center gap-1.5" aria-hidden>
              {tasks.map((item) => (
                <span
                  key={item.href}
                  className={`h-1.5 w-1.5 rounded-full ${
                    item.task <= step ? "bg-brand-500" : "bg-navy-100"
                  }`}
                />
              ))}
            </span>
          </p>
        )}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {prev && <PagerLink item={prev} direction="prev" t={t} />}
        {next ? <PagerLink item={next} direction="next" t={t} /> : <ClosingCta t={t} />}
      </div>
    </nav>
  );
}

/** Closing card shown on the last page instead of a dead-end empty slot: a short
 *  recap + a clear next step (back to the overview), so the highest-leverage
 *  conversion moment of a hiring-pitch case study doesn't just fizzle out. */
function ClosingCta({ t }: { t: TFn }) {
  return (
    <Link
      href="/"
      className="card group flex flex-col items-end gap-2 border-brand-200 bg-brand-50 p-5 text-right transition-all hover:-translate-y-0.5 hover:shadow-pop sm:col-start-2"
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
        {t("closingTag")}
        <ArrowRight
          width={14}
          height={14}
          className="transition-transform group-hover:translate-x-1"
          aria-hidden
        />
      </span>
      <span className="text-base font-semibold text-navy-800 transition-colors group-hover:text-brand-accent">
        {t("closingHeading")}
      </span>
      <span className="text-sm leading-relaxed text-muted">
        {t("closingBody")}
      </span>
    </Link>
  );
}

function PagerLink({ item, direction, t }: { item: NavItem; direction: "prev" | "next"; t: TFn }) {
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
        {isNext ? t("next") : t("prev")}
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
