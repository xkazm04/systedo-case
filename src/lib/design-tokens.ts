/** Living design-token reader. Parses the `@theme` block in `src/app/globals.css`
 *  at build time so the design-system showcase is generated from the token NAMES
 *  themselves and can never drift from the real stylesheet. Used only by the
 *  server-rendered /design-system page — it reads from disk, so it must never be
 *  imported into a client bundle.
 *
 *  Swatches render with `var(--color-…)` (the variables Tailwind v4 emits from
 *  `@theme` into `:root`), so the colour you see is always the live one; the
 *  parsed hex is shown alongside purely as a label. */
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ColorToken {
  /** e.g. "brand-500" or "canvas" */
  name: string;
  /** the CSS custom property, e.g. "--color-brand-500" */
  cssVar: string;
  /** the literal value declared in globals.css, e.g. "#14b8b1" */
  value: string;
  /** ramp family, e.g. "brand", "navy", "canvas" */
  family: string;
  /** numeric ramp step (50…900) or null for single-value tokens */
  step: number | null;
}

export interface ColorRamp {
  family: string;
  tokens: ColorToken[];
}

export interface NamedToken {
  name: string;
  cssVar: string;
  value: string;
}

function readTheme(): string {
  const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
  // The @theme block has no nested braces, so match up to the first close brace.
  const block = css.match(/@theme\s*\{([^}]*)\}/);
  return block ? block[1] : "";
}

/** All `--<category>-<name>: <value>;` declarations inside @theme. */
function parseDeclarations(category: string): Array<{ name: string; value: string }> {
  const theme = readTheme();
  const re = new RegExp(`--${category}-([a-z0-9-]+):\\s*([^;]+);`, "g");
  const out: Array<{ name: string; value: string }> = [];
  for (const m of theme.matchAll(re)) {
    out.push({ name: m[1].trim(), value: m[2].trim() });
  }
  return out;
}

function toColorToken({ name, value }: { name: string; value: string }): ColorToken {
  const stepped = name.match(/^(.*)-(\d+)$/);
  return {
    name,
    cssVar: `--color-${name}`,
    value,
    family: stepped ? stepped[1] : name,
    step: stepped ? Number(stepped[2]) : null,
  };
}

const COLOR_TOKENS: ColorToken[] = parseDeclarations("color").map(toColorToken);

/** Numbered ramps (brand, navy, coral …) in source order, each sorted by step. */
export const colorRamps: ColorRamp[] = (() => {
  const families: string[] = [];
  const byFamily = new Map<string, ColorToken[]>();
  for (const t of COLOR_TOKENS) {
    if (t.step === null) continue;
    if (!byFamily.has(t.family)) {
      byFamily.set(t.family, []);
      families.push(t.family);
    }
    byFamily.get(t.family)!.push(t);
  }
  return families.map((family) => ({
    family,
    tokens: byFamily.get(family)!.slice().sort((a, b) => (a.step ?? 0) - (b.step ?? 0)),
  }));
})();

/** Font-family tokens (--font-*) read from @theme, so the showcase lists them from
 *  the source rather than a hand-kept copy. (The type *size* steps like `text-4xl`
 *  are Tailwind v4 defaults — not custom @theme tokens — so there is nothing of
 *  ours there to drift; only the font families are project tokens.) */
export const fontTokens: NamedToken[] = parseDeclarations("font").map((t) => ({
  name: t.name,
  cssVar: `--font-${t.name}`,
  value: t.value,
}));

/** Single-value colour tokens (canvas, surface, ink, muted, line, positive …). */
export const baseColors: ColorToken[] = COLOR_TOKENS.filter((t) => t.step === null);

export const radiusTokens: NamedToken[] = parseDeclarations("radius").map(({ name, value }) => ({
  name,
  cssVar: `--radius-${name}`,
  value,
}));

export const shadowTokens: NamedToken[] = parseDeclarations("shadow").map(({ name, value }) => ({
  name,
  cssVar: `--shadow-${name}`,
  value,
}));

/** Re-exported from the Node-free colour module so existing
 *  `@/lib/design-tokens` imports keep working, while the client `Swatch` island
 *  can import `readableInkOn` directly from there without pulling node:fs in. */
export { readableInkOn } from "./design-tokens-color";
