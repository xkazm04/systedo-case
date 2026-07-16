/** Shared numeric env-var parsing (server-only: reads process.env).
 *
 *  Consolidates the previously-triplicated `envInt` from `ai/rate-limit`,
 *  `ai/durable-limit` and `catalog/rate-limit`. Those three copies diverged on the
 *  zero-boundary ON PURPOSE, and that divergence is now explicit via `allowZero`
 *  instead of a silent per-copy edit that a future "reconcile the duplicates" pass
 *  could get wrong:
 *   - most knobs (rate caps, body-byte caps, concurrency slots, proxy hops) treat a
 *     configured 0 as invalid and fall back to the default → `allowZero: false` (the
 *     default), matching the old `n > 0` copies;
 *   - a spend CEILING (`AI_GLOBAL_DAILY_CEILING`) uses 0 to mean "disabled", so it
 *     must accept 0 → `allowZero: true`, matching the old `n >= 0` copy.
 *
 *  Preserves the exact prior semantics: `allowZero: false` ⇢ `n > 0`, `allowZero:
 *  true` ⇢ `n >= 0`; a non-finite / out-of-range value falls back to `fallback`, and
 *  a valid value is floored to an integer.
 *
 *  A MALFORMED value (the var is SET but doesn't parse to a usable integer, e.g. a
 *  typo like `AI_RPM=1O`) used to fall back to the default in total silence, so a
 *  misconfigured cap looked like it applied. It now logs a warning ONCE per key
 *  (the `warnedKeys` set below dedupes across the process — this is called on hot
 *  paths, so it must not log every request). It still never throws and still
 *  returns the default: a bad knob degrades to the safe default, loudly. An
 *  UNSET/empty var is the normal "use the default" case and stays silent. */
const warnedKeys = new Set<string>();

export function envInt(
  name: string,
  fallback: number,
  opts: { allowZero?: boolean } = {}
): number {
  const raw = process.env[name];
  const n = Number(raw);
  const inRange = opts.allowZero ? n >= 0 : n > 0;
  if (Number.isFinite(n) && inRange) return Math.floor(n);

  // Malformed (set but unusable) → warn once; unset/empty → stay silent.
  if (raw !== undefined && raw.trim() !== "" && !warnedKeys.has(name)) {
    warnedKeys.add(name);
    console.warn(
      `[env] ${name}="${raw}" is not a valid ${
        opts.allowZero ? "non-negative" : "positive"
      } integer — using default ${fallback}.`
    );
  }
  return fallback;
}
