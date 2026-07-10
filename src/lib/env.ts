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
 *  a valid value is floored to an integer. */
export function envInt(
  name: string,
  fallback: number,
  opts: { allowZero?: boolean } = {}
): number {
  const n = Number(process.env[name]);
  const inRange = opts.allowZero ? n >= 0 : n > 0;
  return Number.isFinite(n) && inRange ? Math.floor(n) : fallback;
}
