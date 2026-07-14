/** Locale sweep, phase 1 — client-surface guard. Every `"use client"` component
 *  must render numbers/dates/currency through the LOCALE-BOUND formatters
 *  (useFormatters() from @/lib/i18n/client, or a threaded `Formatters` prop), NEVER
 *  the static cs-CZ `fmt*` named exports of @/lib/format — those hard-pin Czech
 *  numerals, dates and "Kč" for an English-locale user. This scans the source tree
 *  and fails loudly if any client component regresses to a static value import, so
 *  the completed sweep can't silently rot. Type-only imports (SupportedLocale,
 *  Formatters, CompactA11y) and the factory/config values (createFormatters,
 *  LOCALES, DEFAULT_LOCALE) are allowed — they are the locale-aware seam itself. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createFormatters } from "@/lib/format";

const SRC = join(process.cwd(), "src");

/** Recursively collect every .ts/.tsx source file under src/. */
function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSources(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** A module opts into the client bundle with a leading `"use client"` directive
 *  (allowed to sit after a leading block/line comment). Match it near the top. */
function isClientComponent(src) {
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(src);
}

/** Every `import ... from "@/lib/format"` statement in a file, with the raw brace
 *  body and whether the whole clause is `import type`. */
function formatImports(src) {
  const re = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']@\/lib\/format["']/g;
  const out = [];
  for (const m of src.matchAll(re)) {
    out.push({ typeOnly: Boolean(m[1]), body: m[2] });
  }
  return out;
}

/** Named specifiers that are imported as VALUES (drop inline `type X`). */
function valueSpecifiers(body) {
  return body
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^type\s+/.test(s))
    .map((s) => s.split(/\s+as\s+/)[0].trim());
}

const clientFiles = collectSources(SRC).filter((f) => isClientComponent(readFileSync(f, "utf8")));

test("the source tree actually has client components to guard (sanity)", () => {
  assert.ok(clientFiles.length > 20, `expected many "use client" files, found ${clientFiles.length}`);
});

test('no "use client" component imports a static fmt* value from @/lib/format', () => {
  const violations = [];
  for (const file of clientFiles) {
    const src = readFileSync(file, "utf8");
    for (const imp of formatImports(src)) {
      if (imp.typeOnly) continue; // `import type { … }` — always fine
      const banned = valueSpecifiers(imp.body).filter((name) => /^fmt/.test(name));
      if (banned.length > 0) {
        violations.push(`${file.replace(process.cwd(), ".")}: { ${banned.join(", ")} }`);
      }
    }
  }
  assert.equal(
    violations.length,
    0,
    `client components must use useFormatters()/a Formatters prop, not static @/lib/format exports:\n  ${violations.join(
      "\n  "
    )}`
  );
});

test("fmtSignedPct diverges cs vs en — the delta formatter the migrated client panels call", () => {
  // InsightsPanel / AlertsPanel / WeekdayProfileCard render deltas via
  // fmt.fmtSignedPct(...); an en-locale user must get a period decimal, not the
  // Czech comma, proving the locale binding reaches the client surface.
  const cs = createFormatters("cs");
  const en = createFormatters("en");
  assert.ok(cs.fmtSignedPct(0.124).includes("12,4"), `cs uses a comma decimal: ${cs.fmtSignedPct(0.124)}`);
  assert.ok(en.fmtSignedPct(0.124).includes("12.4"), `en uses a period decimal: ${en.fmtSignedPct(0.124)}`);
  assert.notEqual(cs.fmtSignedPct(0.124), en.fmtSignedPct(0.124));
});
