/** WCAG contrast guard over the token pairs the UI actually composes
 *  (design-system #4). Parses globals.css — the light @theme block plus the
 *  html[data-theme="dark"] overrides — and the PILL_TONES source in ui.tsx, then
 *  asserts every composed pair stays legible in BOTH themes:
 *    - body/link text pairs (ink, muted, brand-accent on canvas/surface) >= 4.5:1
 *    - pill bg/text pairs >= 3:1 (short badge text)
 *  Legibility guard only — the still-open dark-block *equality* check (attribute
 *  block vs the prefers-color-scheme mirror) is a separate concern. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "@/lib/design-tokens-color";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** All `--color-<name>: <value>;` declarations inside one CSS block. */
function parseColors(block) {
  const out = {};
  for (const m of block.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

// Neither block nests braces, so match up to the first close brace.
const themeBlock = css.match(/@theme\s*\{([^}]*)\}/)?.[1] ?? "";
const darkBlock = css.match(/html\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? "";

const light = parseColors(themeBlock);
const darkOverrides = parseColors(darkBlock);

assert.ok(Object.keys(light).length > 20, "light @theme colour tokens parsed");
assert.ok(Object.keys(darkOverrides).length > 10, "dark override colour tokens parsed");

/** Resolve a token under a theme: dark falls back to the light value (the
 *  stable-by-design tokens like onyx/coral-600 are deliberately not overridden). */
const resolve = (token, theme) => {
  const v = theme === "dark" ? (darkOverrides[token] ?? light[token]) : light[token];
  assert.ok(v, `token --color-${token} exists`);
  assert.match(v, /^#[0-9a-f]{3,8}$/i, `--color-${token} is a plain hex the guard can rate: ${v}`);
  return v;
};

/** The pill tone pairs, read from the PILL_TONES source in ui.tsx so a new or
 *  retuned tone lands in this guard automatically (ui.tsx is JSX, which the
 *  node --test type-stripper cannot import directly). */
function pillPairs() {
  const ui = readFileSync(join(process.cwd(), "src", "components", "ui.tsx"), "utf8");
  const start = ui.indexOf("const PILL_TONES");
  assert.ok(start >= 0, "PILL_TONES found in ui.tsx");
  const block = ui.slice(start, ui.indexOf("};", start));
  const pairs = [];
  for (const m of block.matchAll(/(\w+):\s*"bg-([a-z0-9-]+)\s+text-([a-z0-9-]+)"/g)) {
    pairs.push({ tone: m[1], bg: m[2], text: m[3] });
  }
  return pairs;
}

test("every Pill tone stays legible in light AND dark (>= 3:1)", () => {
  const pairs = pillPairs();
  assert.ok(pairs.length >= 6, `parsed the full tone map (got ${pairs.length})`);
  for (const theme of ["light", "dark"]) {
    for (const { tone, bg, text } of pairs) {
      const ratio = contrastRatio(resolve(text, theme), resolve(bg, theme));
      assert.ok(
        ratio >= 3,
        `pill tone "${tone}" (${theme}): text-${text} on bg-${bg} = ${ratio.toFixed(2)}:1 < 3:1`
      );
    }
  }
});

test("body and link text pairs meet WCAG AA (>= 4.5:1) in both themes", () => {
  const TEXT_PAIRS = [
    ["ink", "canvas"],
    ["ink", "surface"],
    ["muted", "canvas"],
    ["muted", "surface"],
    // inline links / eyebrows — the pair the guard originally caught at 4.43:1
    ["brand-accent", "canvas"],
    ["brand-accent", "surface"],
  ];
  for (const theme of ["light", "dark"]) {
    for (const [fg, bg] of TEXT_PAIRS) {
      const ratio = contrastRatio(resolve(fg, theme), resolve(bg, theme));
      assert.ok(
        ratio >= 4.5,
        `${theme}: --color-${fg} on --color-${bg} = ${ratio.toFixed(2)}:1 < 4.5:1`
      );
    }
  }
});

test("contrastRatio math sanity", () => {
  const bw = contrastRatio("#000000", "#ffffff");
  assert.ok(Math.abs(bw - 21) < 0.01, `black on white ≈ 21 (got ${bw})`);
  assert.equal(contrastRatio("#123456", "#123456"), 1);
  // order-independent
  assert.equal(contrastRatio("#0d1a24", "#f4f7f9"), contrastRatio("#f4f7f9", "#0d1a24"));
});
