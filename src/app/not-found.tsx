import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { localizedNavItems } from "@/lib/nav";
import { getServerLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

/** Branded, locale-aware 404. Reached via notFound() from the dynamic routes
 *  (/report/[token], /m/[slug], /app/[projectId] — including its project-
 *  ownership guards) and by any mistyped URL — exactly the links people share
 *  (expired report tokens, retyped microsite slugs). Instead of the
 *  framework's bare English default it guides the visitor back through the
 *  case-study signposts, derived from the nav SSOT so the recovery links can
 *  never drift from the header/footer. Server component (same getServerLocale
 *  + getT pattern as the root layout). */

const T = {
  cs: {
    eyebrow: "Chyba 404",
    heading: "Stránka nenalezena",
    body: "Odkaz může být překlepnutý, přesunutý — nebo už vypršela jeho platnost, sdílené reporty se otevírají jen po omezenou dobu. Vraťte se na rozcestník, nebo pokračujte rovnou na některou z částí případové studie.",
    cta: "Zpět na přehled",
    destinations: "Kam dál",
  },
  en: {
    eyebrow: "Error 404",
    heading: "Page not found",
    body: "The link may be mistyped, moved — or expired, since shared reports open only for a limited time. Head back to the overview, or jump straight to any part of the case study.",
    cta: "Back to overview",
    destinations: "Where to next",
  },
} as const;

export default async function NotFound() {
  const locale = await getServerLocale();
  const t = await getT(T);
  const tasks = localizedNavItems(locale).filter((item) => item.task > 0);
  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-2xl">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-navy-800 sm:text-4xl">
          {t("heading")}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">{t("body")}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.99]"
        >
          {t("cta")}
          <ArrowRight width={16} height={16} aria-hidden />
        </Link>
      </div>

      <p className="mt-14 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {t("destinations")}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {tasks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card group flex flex-col gap-2 p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop"
          >
            <span className="text-base font-semibold text-navy-800 transition-colors group-hover:text-brand-accent">
              {item.label}
            </span>
            <span className="text-sm leading-relaxed text-muted">{item.blurb}</span>
          </Link>
        ))}
      </div>
    </Container>
  );
}
