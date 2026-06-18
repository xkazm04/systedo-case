/** Unit tests for the pure SERP pixel-width + brief-scoring helper (feature #3):
 *  the pixel estimate is monotonic in length, truncateToPixels clips only when
 *  it must (and appends the ellipsis), and scoreBrief flags an over-limit meta
 *  and a missing primary keyword. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateWidthPx,
  truncateToPixels,
  scoreBrief,
  SERP_TITLE_PX,
} from "@/lib/content/seo-score";

/** A well-formed brief fixture; tests override single fields per case. */
const baseBrief = {
  titleTag: "Skladování ořechů: jak je udržet čerstvé",
  metaDescription:
    "Praktický návod na skladování ořechů a semínek doma. Vyhněte se žluknutí, prodlužte trvanlivost a poznejte, co patří do mrazáku.",
  h1: "Skladování ořechů",
  slug: "skladovani-orechu",
  outline: [
    { heading: "Skladování ořechů krok za krokem", points: ["Oxidace tuků a vliv tepla.", "Vlhkost a světlo."] },
    { heading: "Jak je skladovat", points: ["Vzduchotěsné nádoby.", "Chladno a tma."] },
  ],
  faq: [
    { question: "Patří ořechy do lednice?", answer: "Ano, prodlouží to čerstvost." },
    { question: "Lze ořechy mrazit?", answer: "Ano, mrazení je nejlepší pro dlouhé skladování." },
  ],
  keywords: ["skladování ořechů", "trvanlivost", "žluknutí", "mrazení ořechů", "lednice"],
  internalLinks: ["/blog/orechy"],
};

test("estimateWidthPx is monotonic in length (appending never shrinks)", () => {
  let prev = estimateWidthPx("");
  assert.equal(prev, 0);
  let s = "";
  for (const ch of "Skladování ořechů WWW mmm iii") {
    s += ch;
    const w = estimateWidthPx(s);
    assert.ok(w >= prev, `width should not shrink at "${s}"`);
    prev = w;
  }
  // wide glyphs cost more than narrow ones at equal length
  assert.ok(estimateWidthPx("WWWWW") > estimateWidthPx("iiiii"));
});

test("truncateToPixels leaves a fitting string untouched", () => {
  const r = truncateToPixels("Krátký title", 600, SERP_TITLE_PX);
  assert.equal(r.truncated, false);
  assert.equal(r.text, "Krátký title");
});

test("truncateToPixels clips a too-wide string and appends an ellipsis", () => {
  const long = "Toto je opravdu velmi dlouhý title tag, který se do výsledku rozhodně nevejde";
  const r = truncateToPixels(long, 200, SERP_TITLE_PX);
  assert.equal(r.truncated, true);
  assert.ok(r.text.endsWith("…"));
  assert.ok(r.text.length < long.length);
  // the clipped string (incl. ellipsis) still fits the budget
  assert.ok(estimateWidthPx(r.text, SERP_TITLE_PX) <= 200);
});

test("scoreBrief: a clean brief with its keyword scores well and flags nothing red", () => {
  const score = scoreBrief(baseBrief, "skladování ořechů");
  // primary keyword is present in title + meta + first section
  const coverage = Object.fromEntries(score.keywordCoverage.map((c) => [c.id, c.level]));
  assert.equal(coverage["kw-title"], "ok");
  assert.equal(coverage["kw-meta"], "ok");
  const meta = score.eeat.find((c) => c.id === "meta-length");
  assert.equal(meta.level, "ok");
  assert.ok(score.overall >= 70);
  assert.ok(!score.all.some((c) => c.level === "bad"));
});

test("scoreBrief flags a too-long meta description as bad", () => {
  const longMeta = "x".repeat(200);
  const score = scoreBrief({ ...baseBrief, metaDescription: longMeta }, "skladování ořechů");
  const meta = score.eeat.find((c) => c.id === "meta-length");
  assert.equal(meta.level, "bad");
  assert.ok(meta.hint.includes("zkrátí"));
});

test("scoreBrief flags a missing primary keyword across coverage chips", () => {
  const score = scoreBrief(baseBrief, "úplně jiné slovo");
  const coverage = Object.fromEntries(score.keywordCoverage.map((c) => [c.id, c.level]));
  assert.equal(coverage["kw-title"], "bad");
  assert.equal(coverage["kw-meta"], "bad");
  assert.equal(coverage["kw-first"], "bad");

  // an EMPTY keyword degrades to "warn" (not bad) — nothing to look for
  const empty = scoreBrief(baseBrief, "");
  assert.ok(empty.keywordCoverage.every((c) => c.level === "warn"));
});
