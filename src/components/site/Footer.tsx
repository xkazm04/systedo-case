import { Fragment } from "react";
import Link from "next/link";
import { FOOTER_META_PAGES } from "@/lib/nav";
import { getServerLocale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";

export default async function Footer() {
  const locale = await getServerLocale();
  const t = getMessages(locale).footer;
  const copyright = t.copyright.replace("{year}", String(new Date().getFullYear()));

  return (
    <footer className="mt-24 border-t border-line bg-onyx text-onyx-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-onyx-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>{copyright}</span>
        <span className="flex items-center gap-3">
          {FOOTER_META_PAGES.map((p, i) => (
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
                {t.links[p.key]}
              </Link>
            </Fragment>
          ))}
        </span>
      </div>
    </footer>
  );
}
