/** Living design-token reader. Parses the `@theme` block in `src/app/globals.css`
 *  at build time so the design-system showcase is generated from the token NAMES
 *  themselves and can never drift from the real stylesheet. Used only by the
 *  server-rendered /design-system page — it reads from disk, so it must never be
 *  imported into a client bundle.
 *
 *  Swatches render with `var(--color-…)` (the variables Tailwind v4 emits from
 *  `@theme` into `:root`), so the colour you see is always the live one; the
 *  parsed hex is shown alongside purely as a label. */
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

/** Relative luminance (WCAG) of a #rgb / #rrggbb colour, 0 (black) … 1 (white). */
function luminance(hex: string): number {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Pick readable foreground ink (dark or white) for a given swatch colour, so
 *  the on-swatch label stays legible across the whole ramp automatically. */
export function readableInkOn(hex: string): string {
  return /^#[0-9a-f]{3,6}$/i.test(hex.trim()) && luminance(hex) > 0.45
    ? "var(--color-ink)"
    : "#ffffff";
}
