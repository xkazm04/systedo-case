/** Pure colour math, deliberately split out from design-tokens.ts.
 *
 *  design-tokens.ts reads globals.css from disk (node:fs) at module scope, so it
 *  must never enter a client bundle. The swatch island, however, needs to pick a
 *  readable on-swatch ink colour at render time. Keeping that calculation here —
 *  with zero Node imports — lets both the server token reader and the client
 *  `Swatch` component share it without dragging node:fs into the browser chunk.
 */

/** Relative luminance (WCAG) of a #rgb / #rrggbb colour, 0 (black) … 1 (white). */
export function luminance(hex: string): number {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two hex colours, 1 (identical) … 21 (black on
 *  white). Order-independent. Powers the token-pair contrast guard in
 *  test-unit/design-tokens-contrast.test.mjs. */
export function contrastRatio(hexA: string, hexB: string): number {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick readable foreground ink (dark or white) for a given swatch colour, so
 *  the on-swatch label stays legible across the whole ramp automatically. */
export function readableInkOn(hex: string): string {
  return /^#[0-9a-f]{3,6}$/i.test(hex.trim()) && luminance(hex) > 0.45
    ? "var(--color-ink)"
    : "#ffffff";
}
