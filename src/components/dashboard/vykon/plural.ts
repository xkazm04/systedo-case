import type { SupportedLocale } from "@/lib/format";

/** Locale-correct "N days" unit for the truncation hint (Czech needs three
 *  plural forms: 1 den / 2–4 dny / 5+ dní). */
export function dayWord(n: number, locale: SupportedLocale): string {
  if (locale === "en") return n === 1 ? "day" : "days";
  return n === 1 ? "den" : n >= 2 && n <= 4 ? "dny" : "dní";
}

/** Locale-correct "N weeks" unit for the sustained-trend insight
 *  (1 týden / 2–4 týdny / 5+ týdnů). */
export function weekWord(n: number, locale?: SupportedLocale): string {
  if (locale === "en") return n === 1 ? "week" : "weeks";
  return n === 1 ? "týden" : n >= 2 && n <= 4 ? "týdny" : "týdnů";
}
