/** The eight spectral lines as Phase 1 tokens, in fan order (red to violet):
 *  one per module group. The bench art uses the six-line subset SIX. */
export const SPECTRUM = [
  "var(--color-s-red)",
  "var(--color-s-orange)",
  "var(--color-s-amber)",
  "var(--color-s-yellow)",
  "var(--color-s-green)",
  "var(--color-s-cyan)",
  "var(--color-s-blue)",
  "var(--color-s-violet)",
] as const;

/** red, orange, yellow, green, blue, violet: the lines the stations draw */
export const SIX = [0, 1, 3, 4, 6, 7].map((i) => SPECTRUM[i]);
