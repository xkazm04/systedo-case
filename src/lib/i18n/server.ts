/** Server-side locale helpers for Server Components / route handlers, mirroring
 *  the client ones. Both read the same `locale` cookie via getServerLocale, so
 *  server and client render in the same language.
 *  Server-only (getServerLocale uses next/headers). */
import { createFormatters, type Formatters } from "@/lib/format";
import { getServerLocale } from "./locale";
import { interpolate, type TDict, type TFn } from "./interpolate";

/** Locale-bound formatters for a Server Component (await it once near the top). */
export async function getServerFormatters(): Promise<Formatters> {
  return createFormatters(await getServerLocale());
}

/** A translator over a colocated {cs, en} table for a Server Component. */
export async function getT<K extends string>(dict: TDict<K>): Promise<TFn<K>> {
  const locale = await getServerLocale();
  const table = dict[locale] ?? dict.cs;
  return (key, vars) => interpolate(table[key] ?? dict.cs[key] ?? key, vars);
}
