/** Unit tests for the quick-nav (Cmd/Ctrl+K) search model (nav-header-footer
 *  #3): target derivation from the typed nav registry (journey + footer meta
 *  pages + /app gating), diacritics-insensitive matching ("clanek" → "Článek")
 *  and the label-prefix > label-substring > hint-substring ranking. Also guards
 *  the slugify refactor onto the shared normalizer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOOTER_META_PAGES,
  matchNavTargets,
  NAV_ITEMS,
  navSearchTargets,
  normalizeForSearch,
  slugify,
} from "@/lib/nav";

test("normalizeForSearch strips diacritics and lowercases", () => {
  assert.equal(normalizeForSearch("Klíčová SLOVA"), "klicova slova");
  assert.equal(normalizeForSearch("Článek"), "clanek");
});

test("slugify still produces the diacritics-aware slug (shared normalizer refactor)", () => {
  assert.equal(slugify("Zdravý jídelníček"), "zdravy-jidelnicek");
  assert.equal(slugify("Kolik ořechů je tak akorát na den?"), "kolik-orechu-je-tak-akorat-na-den");
});

test("navSearchTargets merges journey pages, footer meta pages and gates /app on auth", () => {
  const anon = navSearchTargets("cs", false);
  const hrefs = anon.map((t) => t.href);
  for (const item of NAV_ITEMS) assert.ok(hrefs.includes(item.href), `missing ${item.href}`);
  for (const page of FOOTER_META_PAGES) assert.ok(hrefs.includes(page.href), `missing ${page.href}`);
  assert.ok(!hrefs.includes("/app"), "anon must not see /app");
  assert.equal(anon.length, NAV_ITEMS.length + FOOTER_META_PAGES.length);

  const authed = navSearchTargets("cs", true);
  assert.ok(authed.some((t) => t.href === "/app"), "authed sees /app");
});

test("targets are localized (en labels come from the message dictionary)", () => {
  const en = navSearchTargets("en", false);
  assert.equal(en.find((t) => t.href === "/clanek")?.label, "Article");
  assert.equal(en.find((t) => t.href === "/cena")?.label, "Pricing");
});

test("matching is diacritics-insensitive: 'clanek' finds Článek first", () => {
  const targets = navSearchTargets("cs", false);
  const hits = matchNavTargets("clanek", targets);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].href, "/clanek");
});

test("ranking: label prefix beats label substring beats hint substring", () => {
  const targets = [
    { href: "/hint", label: "Jiná stránka", hint: "obsahuje dashboard v popisu" },
    { href: "/substr", label: "Můj dashboard", hint: "" },
    { href: "/prefix", label: "Dashboard", hint: "" },
  ];
  const hits = matchNavTargets("dashboard", targets);
  assert.deepEqual(
    hits.map((h) => h.href),
    ["/prefix", "/substr", "/hint"]
  );
});

test("an empty or whitespace query returns everything in nav order; a miss returns nothing", () => {
  const targets = navSearchTargets("cs", false);
  assert.deepEqual(matchNavTargets("", targets), targets);
  assert.deepEqual(matchNavTargets("   ", targets), targets);
  assert.equal(matchNavTargets("xyzzy-neexistuje", targets).length, 0);
});
