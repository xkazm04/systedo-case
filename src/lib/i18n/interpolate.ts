/** Replace {name} placeholders in a message with values. Framework-free so both
 *  the client (useT) and server (getT) translation helpers share one implementation. */
import type { SupportedLocale } from "@/lib/format";

export function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, key) =>
    key in vars ? String(vars[key]) : m
  );
}

/** A colocated translation table: the same keys in every supported locale,
 *  defined next to the component that uses them (so localization parallelizes
 *  per-file without one giant central dictionary). `cs` is the source of truth.
 *  Keyed by SupportedLocale (derived from SUPPORTED_LOCALES) so adding a market
 *  makes every TDict a loud type error until its column is filled in, rather than
 *  silently shipping a missing locale. */
export type TDict<K extends string> = Record<SupportedLocale, Record<K, string>>;

export type TFn<K extends string> = (key: K, vars?: Record<string, string | number>) => string;
