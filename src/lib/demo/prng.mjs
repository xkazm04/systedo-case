/** Shared deterministic-demo primitives: the seeded PRNG + string hash every
 *  demo-data generator uses (the dashboard seed script, the sample campaigns and
 *  the sample keyword ideas). One implementation instead of three copies, so the
 *  "reproducible for a given seed" promise can't drift per surface.
 *
 *  Plain .mjs (not .ts) on purpose: `scripts/generate-data.mjs` runs under plain
 *  Node with no TS loader, while the TS modules import it through the `@/` alias
 *  (allowJs) — one file serves both worlds byte-identically.
 */

/** Seeded PRNG (mulberry32): tiny, fast, and good enough for demo jitter.
 *  Returns a function yielding floats in [0, 1) deterministically per seed.
 *  @param {number} seed
 *  @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → 32-bit numeric seed. Keeps each seed key
 *  reproducible-but-distinct when fed into {@link mulberry32}.
 *  @param {string} s
 *  @returns {number}
 */
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
