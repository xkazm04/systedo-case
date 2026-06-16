"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { SupportedLocale } from "@/lib/format";

const LABEL: Record<SupportedLocale, string> = { cs: "CS", en: "EN" };
const NEXT: Record<SupportedLocale, SupportedLocale> = { cs: "en", en: "cs" };

/** Compact CS/EN toggle for the header. Switches the active locale (cookie +
 *  route refresh), so the shared chrome re-renders instantly. */
export default function LocaleSwitcher() {
  const { locale, setLocale, messages } = useLocale();
  return (
    <button
      type="button"
      onClick={() => setLocale(NEXT[locale])}
      aria-label={`${messages.switcher.label}: ${LABEL[locale]}`}
      title={messages.switcher.label}
      className="grid h-10 min-w-10 place-items-center rounded-lg px-2 text-xs font-semibold text-navy-700 transition-colors hover:bg-navy-50"
    >
      {LABEL[locale]}
    </button>
  );
}
