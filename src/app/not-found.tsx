/** Branded 404. Catches unmatched routes and any notFound() that bubbles up
 *  (including the /app project-ownership guards), rendered inside the root
 *  layout so it keeps the site chrome and dark mode. */
import Link from "next/link";
import { Container } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    title: "Stránka nenalezena",
    body: "Tuto stránku se nepodařilo najít. Možná byla přesunuta nebo neexistuje.",
    home: "Zpět na úvod",
  },
  en: {
    title: "Page not found",
    body: "We couldn't find that page. It may have moved or never existed.",
    home: "Back home",
  },
} as const;

export default async function NotFound() {
  const t = await getT(T);
  return (
    <Container className="py-24">
      <div className="card mx-auto max-w-lg p-8 text-center">
        <p className="text-5xl font-bold tracking-tight text-brand-accent">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-3 text-sm text-muted">{t("body")}</p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/"
            className="rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.99]"
          >
            {t("home")}
          </Link>
        </div>
      </div>
    </Container>
  );
}
