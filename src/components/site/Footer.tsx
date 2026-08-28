import { Fragment } from "react";
import Link from "next/link";
import { footerLinks } from "@/lib/nav";
import { getServerLocale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";

export default async function Footer() {
  const locale = await getServerLocale();
  const t = getMessages(locale).footer;
  const links = footerLinks(locale);
  const copyright = t.copyright.replace("{year}", String(new Date().getFullYear()));

  return (
    <footer className="mt-24 border-t border-line bg-onyx text-onyx-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-onyx-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>{copyright}</span>
        {/* wraps: the meta links overflow a 390px viewport on one line, which
            side-scrolled the whole page. gap-y keeps the wrapped rows legible. */}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {links.map((p, i) => (
            <Fragment key={p.href}>
              {i > 0 && (
                <span aria-hidden className="text-onyx-line">
                  ·
                </span>
              )}
              <Link
                href={p.href}
                className="font-medium text-onyx-muted transition-colors hover:text-brand-300"
              >
                {p.label}
              </Link>
            </Fragment>
          ))}
        </span>
      </div>
    </footer>
  );
}
