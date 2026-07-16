/** Wholesale-demo billing honesty (src/lib/ai/tools/lp-variant-ideas.ts +
 *  channel-research.ts). Both tools' normalizers can return the deterministic demo
 *  WHOLESALE when nothing usable survives — the wrapper can't see inside normalize(),
 *  so that free canned output was billed as a live generation. The tracked normalizers
 *  now report `canned: true` for that case so the caller sets meta.demo (refund fires).
 *  Mirrors comparison-outline / keyword-clusters. Pure — no model. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { normalizeLpVariantIdeasTracked } = await import("@/lib/ai/tools/lp-variant-ideas");
const { normalizeChannelResearchTracked } = await import("@/lib/ai/tools/channel-research");

// ── lp-variant-ideas: all-or-nothing (needs ≥2 distinct challengers) ────────────

const lpReq = { topic: "skladování ořechů" };
const variant = (label) => ({
  label,
  hypothesis: "protože to zlepší konverzi oproti kontrole",
  headline: "Nadpis",
  primaryCTA: "Akce",
  rationale: "Dává smysl.",
});

test("lp-variant-ideas: <2 usable model variants → canned demo (full demo billing)", () => {
  const one = normalizeLpVariantIdeasTracked({ variants: [variant("A")] }, lpReq);
  assert.equal(one.canned, true);
  assert.ok(one.result.variants.length >= 2, "falls back to the 2-angle demo");

  assert.equal(normalizeLpVariantIdeasTracked({ variants: [] }, lpReq).canned, true);
  assert.equal(normalizeLpVariantIdeasTracked("garbage", lpReq).canned, true);
});

test("lp-variant-ideas: ≥2 distinct model variants → a real answer (not canned)", () => {
  const out = normalizeLpVariantIdeasTracked({ variants: [variant("A"), variant("B")] }, lpReq);
  assert.equal(out.canned, false);
  assert.equal(out.result.variants.length, 2);
});

// ── channel-research: canned when no named channel survives normalization ───────

const chReq = { projectType: "eshop", brand: "Ořechárna" };
const channel = (name) => ({
  name,
  category: "content",
  fit: 80,
  effort: "low",
  rationale: "Sedí.",
  payoff: "Viditelnost.",
  firstActions: ["Založit profil."],
});

test("channel-research: no named channel → canned demo (full demo billing)", () => {
  assert.equal(normalizeChannelResearchTracked({ channels: [] }, chReq).canned, true);
  assert.equal(normalizeChannelResearchTracked({ summary: "x" }, chReq).canned, true);
  assert.equal(normalizeChannelResearchTracked("garbage", chReq).canned, true);
});

test("channel-research: at least one named model channel → a real answer", () => {
  const out = normalizeChannelResearchTracked({ summary: "Nejlepší je SEO.", channels: [channel("SEO")] }, chReq);
  assert.equal(out.canned, false);
  assert.equal(out.result.channels.length, 1);
});
