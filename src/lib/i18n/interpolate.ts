/** Replace {name} placeholders in a message with values. Framework-free so both
 *  the client (useT) and server (getT) translation helpers share one implementation. */
export function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, key) =>
    key in vars ? String(vars[key]) : m
  );
}

/** A colocated translation table: the same keys in Czech and English, defined
 *  next to the component that uses them (so localization parallelizes per-file
 *  without one giant central dictionary). `cs` is the source of truth. */
export interface TDict<K extends string> {
  cs: Record<K, string>;
  en: Record<K, string>;
}

export type TFn<K extends string> = (key: K, vars?: Record<string, string | number>) => string;
