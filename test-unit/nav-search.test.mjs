/** Unit tests for the quick-nav (Cmd/Ctrl+K) search model (nav-header-footer
 *  #3): target derivation from the typed nav registry (journey + footer meta
 *  pages + /app gating), diacritics-insensitive matching ("clanek" → "Článek")
 *  and the label-prefix > label-substring > hint-substring ranking. Also guards
 *  the slugify refactor onto the shared normalizer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEATURE_NAV_ITEMS,
  FOOTER_META_PAGES,
  footerLinks,
  matchNavTargets,
  NAV_ITEMS,
  navSearchTargets,
  normalizeForSearch,
  slugify,
} from "@/lib/nav";
import { MESSAGES } from "@/lib/i18n/messages";

test("cs nav dictionary mirrors NAV_ITEMS exactly (guards the duplicated source of truth)", () => {
  // nav.ts short-circuits locale==="cs" to NAV_ITEMS, so MESSAGES.cs.nav.items is
  // never rendered and nothing else catches it drifting from NAV_ITEMS. This pins
  // the two together: reword a NAV_ITEMS blurb without updating the dictionary → fail.
  // Feature pages (FEATURE_NAV_ITEMS) are localized through the same dictionary,
  // so they belong to the same projection.
  const projection = Object.fromEntries(
    [...NAV_ITEMS, ...FEATURE_NAV_ITEMS].map((i) => [i.href, { label: i.label, blurb: i.blurb }])
  );
  assert.deepEqual(MESSAGES.cs.nav.items, projection);
});

test("normalizeForSearch strips diacritics and lowercases", () => {
  assert.equal(normalizeForSearch("Klíčová SLOVA"), "klicova slova");
  assert.equal(normalizeForSearch("Článek"), "clanek");
});

test("slugify still produces the diacritics-aware slug (shared normalizer refactor)", () => {
  assert.equal(slugify("Zdravý jídelníček"), "zdravy-jidelnicek");
  assert.equal(slugify("Kolik ořechů je tak akorát na den?"), "kolik-orechu-je-tak-akorat-na-den");
});

test("navSearchTargets merges journey pages, feature pages, footer meta pages and gates /app on auth", () => {
  const anon = navSearchTargets("cs", false);
  const hrefs = anon.map((t) => t.href);
  for (const item of NAV_ITEMS) assert.ok(hrefs.includes(item.href), `missing ${item.href}`);
  for (const item of FEATURE_NAV_ITEMS) assert.ok(hrefs.includes(item.href), `missing ${item.href}`);
  for (const page of FOOTER_META_PAGES) assert.ok(hrefs.includes(page.href), `missing ${page.href}`);
  assert.ok(!hrefs.includes("/app"), "anon must not see /app");
  assert.equal(
    anon.length,
    NAV_ITEMS.length + FEATURE_NAV_ITEMS.length + FOOTER_META_PAGES.length
  );

  const authed = navSearchTargets("cs", true);
  assert.ok(authed.some((t) => t.href === "/app"), "authed sees /app");
});

test("footerLinks renders feature pages first, then the meta pages, localized", () => {
  const cs = footerLinks("cs");
  assert.deepEqual(
    cs.map((l) => l.href),
    [...FEATURE_NAV_ITEMS.map((i) => i.href), ...FOOTER_META_PAGES.map((p) => p.href)]
  );
  // A feature page reuses its nav label rather than needing a second copy of it.
  assert.equal(cs[0].label, FEATURE_NAV_ITEMS[0].label);
  assert.equal(footerLinks("en")[0].label, MESSAGES.en.nav.items[FEATURE_NAV_ITEMS[0].href].label);
  assert.equal(footerLinks("en").at(-1).label, MESSAGES.en.footer.links.terms);
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
