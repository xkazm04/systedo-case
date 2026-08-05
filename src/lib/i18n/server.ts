/** Server-side locale helpers for Server Components / route handlers, mirroring
 *  the client ones. Both read the same `locale` cookie via getServerLocale, so
 *  server and client render in the same language.
 *  Server-only (getServerLocale uses next/headers). */
import { cache } from "react";
import { createFormatters, type Formatters } from "@/lib/format";
import { getServerLocale } from "./locale";
import { interpolate, type TDict, type TFn } from "./interpolate";

/** Locale-bound formatters for a Server Component (await it once near the top).
 *  Wrapped in React `cache()` (mirroring src/lib/session.ts) so every Server
 *  Component in one request that asks for formatters shares ONE resolved set —
 *  the locale cookie is read once and one `Formatters` object is threaded through
 *  the render instead of each call site rebuilding it. The underlying Intl
 *  instances are module-scope singletons (see format.ts), so this dedup is purely
 *  about the per-request cookie read + object churn, never correctness. */
export const getServerFormatters = cache(async (): Promise<Formatters> => {
  return createFormatters(await getServerLocale());
});

/** A translator over a colocated {cs, en} table for a Server Component.
 *  Mirrors useT's fallback: `en` is the authoring source of truth, so a hole in a
 *  translated column renders source English rather than a raw key. */
export async function getT<K extends string>(dict: TDict<K>): Promise<TFn<K>> {
  const locale = await getServerLocale();
  const table = dict[locale] ?? dict.en;
  return (key, vars) => interpolate(table[key] ?? dict.en[key] ?? key, vars);
}
