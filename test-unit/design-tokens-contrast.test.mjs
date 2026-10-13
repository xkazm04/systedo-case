/** WCAG contrast guard over the token pairs the UI actually composes
 *  (design-system #4). Parses globals.css — the single dark-only @theme block
 *  (ADR-0014: Optic Bench, one binding, no theme switch) — and the PILL_TONES
 *  and BUTTON_VARIANTS sources in ui.tsx, then asserts every composed pair stays
 *  legible:
 *    - body/link text pairs (ink, muted, brand-accent on canvas/surface) >= 4.5:1
 *    - pill bg/text pairs >= 3:1 (short badge text)
 *    - button fill/label pairs >= 4.5:1 (the amber action carries dark ink)
 *  It also refuses a second binding: a returning light or `data-theme` block is a
 *  reversal of ADR-0014, not a tweak, and should arrive as a new ADR. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "@/lib/design-tokens-color";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
const ui = readFileSync(join(process.cwd(), "src", "components", "ui.tsx"), "utf8");

/** All `--color-<name>: <value>;` declarations inside one CSS block. */
function parseColors(block) {
  const out = {};
  for (const m of block.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

// The block does not nest braces, so match up to the first close brace.
// `@theme static`: Tailwind v4 otherwise drops a variable no utility references,
// and area/series hues are read through var() by the kit, not by utilities.
const themeBlock = css.match(/@theme(?:\s+static)?\s*\{([^}]*)\}/)?.[1] ?? "";
const tokens = parseColors(themeBlock);

assert.ok(Object.keys(tokens).length > 20, "@theme colour tokens parsed");

const resolve = (token) => {
  const v = tokens[token];
  assert.ok(v, `token --color-${token} exists`);
  assert.match(v, /^#[0-9a-f]{3,8}$/i, `--color-${token} is a plain hex the guard can rate: ${v}`);
  return v;
};

/** `bg-X text-Y` pairs from one `const NAME ... };` block in ui.tsx. */
function pairsFrom(constName) {
  const start = ui.indexOf(`const ${constName}`);
  assert.ok(start >= 0, `${constName} found in ui.tsx`);
  const block = ui.slice(start, ui.indexOf("};", start));
  const pairs = [];
  for (const line of block.split("\n")) {
    const name = line.match(/^\s*(\w+):\s*"/)?.[1];
    const bg = line.match(/(?:^|[\s"])bg-([a-z0-9-]+)/)?.[1];
    const text = line.match(/(?:^|[\s"])text-([a-z][a-z0-9-]*)/)?.[1];
    if (name && bg && text && !/^(xs|sm|base|lg|xl)$/.test(text)) pairs.push({ name, bg, text });
  }
  return pairs;
}

test("the theme is dark-only: no light or data-theme override block", () => {
  assert.doesNotMatch(css, /html\[data-theme=/, "a data-theme block is back — ADR-0014 is dark-only");
  assert.doesNotMatch(css, /prefers-color-scheme:\s*(dark|light)/, "a colour-scheme media block is back");
});

test("every Pill tone stays legible on its tint (>= 3:1)", () => {
  const pairs = pairsFrom("PILL_TONES");
  assert.ok(pairs.length >= 6, `parsed the full tone map (got ${pairs.length})`);
  for (const { name, bg, text } of pairs) {
    const ratio = contrastRatio(resolve(text), resolve(bg));
    assert.ok(ratio >= 3, `pill tone "${name}": text-${text} on bg-${bg} = ${ratio.toFixed(2)}:1 < 3:1`);
  }
});

test("every filled Button variant carries a legible label (>= 4.5:1)", () => {
  const pairs = pairsFrom("BUTTON_VARIANTS");
  assert.ok(pairs.some((p) => p.name === "primary"), "the primary (amber) variant was parsed");
  for (const { name, bg, text } of pairs) {
    const ratio = contrastRatio(resolve(text), resolve(bg));
    assert.ok(ratio >= 4.5, `button "${name}": text-${text} on bg-${bg} = ${ratio.toFixed(2)}:1 < 4.5:1`);
  }
});

test("body and link text pairs meet WCAG AA (>= 4.5:1)", () => {
  const TEXT_PAIRS = [
    ["ink", "canvas"],
    ["ink", "surface"],
    ["muted", "canvas"],
    ["muted", "surface"],
    ["brand-accent", "canvas"],
    ["brand-accent", "surface"],
    ["navy-700", "surface"],
    ["coral-600", "surface"],
    ["onyx-ink", "onyx"],
    ["onyx-muted", "onyx"],
  ];
  for (const [fg, bg] of TEXT_PAIRS) {
    const ratio = contrastRatio(resolve(fg), resolve(bg));
    assert.ok(ratio >= 4.5, `--color-${fg} on --color-${bg} = ${ratio.toFixed(2)}:1 < 4.5:1`);
  }
});

test("contrastRatio math sanity", () => {
  const bw = contrastRatio("#000000", "#ffffff");
  assert.ok(Math.abs(bw - 21) < 0.01, `black on white ≈ 21 (got ${bw})`);
  assert.equal(contrastRatio("#123456", "#123456"), 1);
  assert.equal(contrastRatio("#0d1a24", "#f4f7f9"), contrastRatio("#f4f7f9", "#0d1a24"));
});
