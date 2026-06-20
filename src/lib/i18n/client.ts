"use client";

/** Client-side locale helpers for components rendered under the app's
 *  LocaleProvider (which wraps the whole tree). Two things every client surface
 *  needs to be localized:
 *    - useFormatters() → locale-bound number/currency/date formatters.
 *    - useT(dict)      → a translator over a colocated cs/en table.
 */
import { useMemo } from "react";
import { createFormatters, type Formatters } from "@/lib/format";
import { useLocale } from "./LocaleProvider";
import { interpolate, type TDict, type TFn } from "./interpolate";

/** Number/currency/date formatters bound to the active locale (EN → en-US/USD,
 *  CS → cs-CZ/CZK), so a client surface stops hardcoding the Czech instance. */
export function useFormatters(): Formatters {
  const { locale } = useLocale();
  return useMemo(() => createFormatters(locale), [locale]);
}

/** A translator over a colocated {cs, en} table, picking the active locale. */
export function useT<K extends string>(dict: TDict<K>): TFn<K> {
  const { locale } = useLocale();
  const table = dict[locale] ?? dict.cs;
  return (key, vars) => interpolate(table[key] ?? dict.cs[key] ?? key, vars);
}
