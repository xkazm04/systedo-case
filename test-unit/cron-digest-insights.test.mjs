/** Direction 2 — the weekly-digest insight brief: the shared significance-ranked
 *  selection (buildInsightLines, reused by the dashboard InsightsPanel) plus the
 *  pure email/inbox formatting (src/lib/cron/insight-brief.ts). No store, no LLM. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFormatters } from "@/lib/format";
import {
  buildInsightLines,
  makeInsightT,
} from "@/components/dashboard/vykon/insight-lines";
import {
  provenanceLabel,
  insightBriefAlertBody,
  insightBriefHtml,
} from "@/lib/cron/insight-brief";

/** Minimal significance record — only the keys the crafted input exercises. */
const sig = { revenue: "strong", pno: "weak", roas: "noise", visits: "noise" };

function linesFor(locale) {
  return buildInsightLines(
    {
      channels: [],
      revenueDelta: 0.25, // a strong revenue move
      pno: 0.3,
      goalPno: 0.2, // above goal → a warn line
      trends: [],
      profile: [],
      funnel: null,
      significance: sig,
      baseline: "previous",
      windowEndDate: "",
    },
    createFormatters(locale),
    makeInsightT(locale),
    locale
  );
}

test("selection ranks by the engine's confidence (strong before weak)", () => {
  const lines = linesFor("cs");
  const ids = lines.map((l) => l.id);
  assert.ok(ids.includes("revenue"), "revenue move surfaced");
  assert.ok(ids.includes("pno"), "pno-vs-goal surfaced");
  // strong revenue must lead the weak pno line.
  assert.ok(ids.indexOf("revenue") < ids.indexOf("pno"), "strong leads weak");
  assert.equal(lines[0].significance, "strong");
});

test("wording follows the locale (cs vs en)", () => {
  const cs = linesFor("cs").find((l) => l.id === "revenue");
  const en = linesFor("en").find((l) => l.id === "revenue");
  assert.match(cs.line, /Obrat/);
  assert.match(en.line, /Revenue/);
});

test("provenance label is honest and localized", () => {
  assert.equal(provenanceLabel(true, "cs"), "Živá data");
  assert.equal(provenanceLabel(false, "cs"), "Ukázková data");
  assert.equal(provenanceLabel(true, "en"), "Live data");
  assert.equal(provenanceLabel(false, "en"), "Sample data");
});

test("alert body carries the provenance header + the lines", () => {
  const lines = linesFor("cs").slice(0, 3);
  const body = insightBriefAlertBody(lines, true, "cs");
  assert.match(body, /Přehled týdne \(Živá data\):/);
  assert.ok(body.includes(lines[0].line));
});

test("zero insights → no section (empty body + empty html), never filler", () => {
  assert.equal(insightBriefAlertBody([], true, "cs"), "");
  assert.equal(insightBriefHtml([], true, "cs"), "");
});

test("email html labels a sample dataset as sample and escapes line text", () => {
  const crafted = [
    { id: "x", line: "A & B <c>", tone: "info", significance: "strong", magnitude: 1 },
  ];
  const html = insightBriefHtml(crafted, false, "cs");
  assert.match(html, /Přehled týdne \(Ukázková data\)/);
  assert.ok(html.includes("A &amp; B &lt;c&gt;"), "escapes HTML-special characters");
  assert.ok(!html.includes("<c>"), "raw markup never leaks into the email");
});
