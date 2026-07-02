/** Unit tests for the shared Article validation guard (article-content #3):
 *  the checks that used to protect only the hand-authored article.json now
 *  guard every producer — malformed shapes fail loudly with the producer named
 *  in the error message, and the deterministic snapshotToArticle bridge
 *  (behind /clanek/vykon and the /m/{slug} microsites) round-trips through the
 *  guard cleanly. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateArticle } from "@/lib/article-validate";
import { snapshotToArticle } from "@/lib/snapshot-to-article";
import { buildMetricsSnapshot } from "@/lib/metrics/snapshot";

/** A minimal well-formed article; tests mutate a fresh copy per case. */
const validArticle = () => ({
  meta: {
    title: "Testovací článek",
    perex: "Perex.",
    author: "Test",
    role: "Autor",
    dateISO: "2026-01-01",
    readingMinutes: 3,
    category: "Test",
    tags: [],
  },
  blocks: [
    { type: "h2", id: "uvod", text: "Úvod" },
    { type: "p", content: ["Odkaz na ", { text: "úvod", href: "#uvod", kind: "anchor" }, "."] },
  ],
  faq: [{ q: "Otázka?", a: ["Odpověď."] }],
});

test("a well-formed article passes and is returned as-is", () => {
  const a = validArticle();
  assert.equal(validateArticle(a), a);
});

test("a non-object input fails", () => {
  assert.throws(() => validateArticle(null), /Invalid article\.json: not an object/);
});

test("an unknown block type fails", () => {
  const a = validArticle();
  a.blocks.push({ type: "video", src: "/x.mp4" });
  assert.throws(() => validateArticle(a), /unknown type/);
});

// --- table blocks -------------------------------------------------------------

/** A well-formed 2×2 table block. */
const validTable = () => ({
  type: "table",
  caption: "Srovnání",
  header: ["Druh", "Cena"],
  rows: [
    [["vlašské"], ["200 Kč"]],
    [[{ text: "kešu", bold: true }], ["260 Kč"]],
  ],
});

test("a well-formed table block passes", () => {
  const a = validArticle();
  a.blocks.push(validTable());
  assert.equal(validateArticle(a), a);
});

test("a table without a header fails", () => {
  const a = validArticle();
  a.blocks.push({ ...validTable(), header: [] });
  assert.throws(() => validateArticle(a), /needs a non-empty header/);
});

test("a table row with the wrong number of cells fails", () => {
  const a = validArticle();
  const table = validTable();
  table.rows.push([["jen jedna buňka"]]);
  a.blocks.push(table);
  assert.throws(() => validateArticle(a), /rows must each have exactly 2 cells/);
});

test("a dead anchor inside a table cell is caught", () => {
  const a = validArticle();
  const table = validTable();
  table.rows[0][1] = [{ text: "ceník", href: "#cenik-neexistuje", kind: "anchor" }];
  a.blocks.push(table);
  assert.throws(() => validateArticle(a), /anchor "#cenik-neexistuje" has no matching heading id/);
});

test("a figure without intrinsic dimensions fails", () => {
  const a = validArticle();
  a.blocks.push({ type: "figure", src: "/clanek/x.svg", alt: "x", width: 0, height: 400 });
  assert.throws(() => validateArticle(a), /needs src, alt, width and height/);
});

test("a duplicate heading id fails", () => {
  const a = validArticle();
  a.blocks.push({ type: "h3", id: "uvod", text: "Duplikát" });
  assert.throws(() => validateArticle(a), /duplicate heading id/);
});

test("a dead anchor fails, naming the producer in the message", () => {
  const a = validArticle();
  a.blocks[1].content[1] = { text: "pryč", href: "#neexistuje", kind: "anchor" };
  assert.throws(
    () => validateArticle(a, "generated report"),
    /Invalid generated report: anchor "#neexistuje" has no matching heading id/
  );
});

test("an empty FAQ fails (FAQPage requires >= 1 question)", () => {
  const a = validArticle();
  a.faq = [];
  assert.throws(() => validateArticle(a), /faq needs/);
});

// --- snapshotToArticle round-trip --------------------------------------------

/** Deterministic 60-day performance fixture ending 2026-05-31. */
function perfFixture() {
  const daily = [];
  const start = Date.UTC(2026, 3, 2); // 2026-04-02 → 60 daily points → 2026-05-31
  for (let i = 0; i < 60; i++) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    daily.push({
      date,
      visits: 1000 + i,
      cost: 5000 + 10 * i,
      conversions: 40 + (i % 5),
      revenue: 30000 + 100 * i,
    });
  }
  return {
    client: { name: "Mionelo", domain: "mionelo.cz", segment: "e-shop", currency: "CZK", managedBy: "Systedo" },
    meta: { disclaimer: "", asOf: "2026-05-31", days: 60, seed: 1 },
    goals: { pno: 0.15, monthlyRevenue: 1_000_000 },
    channels: [
      { channel: "Google Ads", color: "#14b8b1", shares: { visits: 0.6, cost: 0.7, conversions: 0.6, revenue: 0.55 } },
      { channel: "Seznam", color: "#fb7141", shares: { visits: 0.4, cost: 0.3, conversions: 0.4, revenue: 0.45 } },
    ],
    daily,
  };
}

test("snapshotToArticle output passes the guard (round-trip)", () => {
  const snapshot = buildMetricsSnapshot(perfFixture(), { key: "30d", label: "30 dní", days: 30 });
  const article = snapshotToArticle(snapshot, { name: "Mionelo", segment: "e-shop" }, "2026-05-31");
  assert.ok(article.blocks.length > 0, "bridge emits blocks");
  assert.ok(article.faq.length >= 1, "bridge emits an FAQ");
  // the paid-channel breakdown ships as a real table block (validated above)
  const table = article.blocks.find((b) => b.type === "table");
  assert.ok(table, "bridge emits the per-channel breakdown table");
  assert.equal(table.rows.length, 2, "one row per paid channel");
  assert.ok(table.rows.every((r) => r.length === table.header.length));
  assert.equal(article.meta.dateISO, "2026-05-31");
  // explicit re-validation is idempotent and keeps the same object
  assert.equal(validateArticle(article, "round-trip"), article);
});
