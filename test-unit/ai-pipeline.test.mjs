/** Unit tests for the content-pipeline step mappers (src/lib/ai/pipeline):
 *  textarea parsing, cluster → brief, brief → draft, draft → repurpose and the
 *  Markdown serialization the distribution step grounds itself in. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PIPELINE_KEYWORDS_MAX,
  briefToArticleDraftRequest,
  clusterToBriefRequest,
  draftBodyMarkdown,
  draftToMarkdownDoc,
  draftToRepurposeRequest,
  parseKeywordLines,
} from "@/lib/ai/pipeline";

const brief = (over = {}) => ({
  titleTag: "Skladování ořechů: průvodce",
  metaDescription: "Jak skladovat ořechy, aby vydržely.",
  h1: "Jak skladovat ořechy",
  slug: "skladovani-orechu",
  outline: [{ heading: "Proč žluknou", points: ["Vzduch", "Teplo"] }],
  faq: [{ question: "Do lednice?", answer: "Ano." }],
  keywords: ["skladování ořechů"],
  internalLinks: [],
  rationale: "",
  ...over,
});

const draft = (over = {}) => ({
  blocks: [
    { type: "h2", text: "Proč žluknou" },
    { type: "p", content: ["Tuky oxidují."] },
  ],
  faq: [{ q: "Do lednice?", a: ["Ano."] }],
  ...over,
});

test("parseKeywordLines parses keyword;volume lines, dedupes and caps", () => {
  const parsed = parseKeywordLines("skladování ořechů; 720\nkešu \nSkladování ořechů;10\n\n;50");
  assert.deepEqual(parsed, [
    { keyword: "skladování ořechů", volume: 720 },
    { keyword: "kešu" },
  ]);
  const many = Array.from({ length: 80 }, (_, i) => `kw${i}`).join("\n");
  assert.equal(parseKeywordLines(many).length, PIPELINE_KEYWORDS_MAX);
});

test("clusterToBriefRequest maps pillar/topic and carries volumes from the input set", () => {
  const cluster = { topic: "Skladování", pillar: "skladování ořechů", supporting: ["kešu"], totalVolume: 730 };
  const inputs = [{ keyword: "skladování ořechů", volume: 720 }, { keyword: "kešu", volume: 10 }];
  const req = clusterToBriefRequest(cluster, inputs, { audience: "Domácí pekaři" });
  assert.equal(req.topic, "Skladování");
  assert.equal(req.primaryKeyword, "skladování ořechů");
  assert.equal(req.audience, "Domácí pekaři");
  assert.equal(req.contentType, "blog");
  assert.deepEqual(req.keywords, [
    { keyword: "skladování ořechů", volume: 720, competition: "" },
    { keyword: "kešu", volume: 10, competition: "" },
  ]);
});

test("clusterToBriefRequest falls back to the pillar when the topic is empty", () => {
  const cluster = { topic: "  ", pillar: "kešu", supporting: [], totalVolume: 0 };
  const req = clusterToBriefRequest(cluster, [], { audience: "A", contentType: "kategorie" });
  assert.equal(req.topic, "kešu");
  assert.equal(req.contentType, "kategorie");
});

test("briefToArticleDraftRequest is the ArticleDraftPanel subset plus audience", () => {
  const req = briefToArticleDraftRequest(brief(), { audience: "Pekaři", contentType: "blog" });
  assert.equal(req.titleTag, "Skladování ořechů: průvodce");
  assert.equal(req.slug, "skladovani-orechu");
  assert.equal(req.outline.length, 1);
  assert.equal(req.audience, "Pekaři");
  assert.equal(req.contentType, "blog");
  assert.equal("refine" in req, false);
});

test("draftBodyMarkdown serializes blocks via the shared serializer", () => {
  assert.equal(draftBodyMarkdown(draft()), "## Proč žluknou\n\nTuky oxidují.");
});

test("draftToMarkdownDoc includes h1, perex, body and FAQ", () => {
  const md = draftToMarkdownDoc(brief(), draft());
  assert.ok(md.startsWith("# Jak skladovat ořechy\n"));
  assert.ok(md.includes("_Jak skladovat ořechy, aby vydržely._"));
  assert.ok(md.includes("## Proč žluknou"));
  assert.ok(md.includes("**Do lednice?**"));
});

test("draftToRepurposeRequest builds the article URL from origin + slug", () => {
  const req = draftToRepurposeRequest({
    brief: brief(),
    draft: draft(),
    channels: ["LinkedIn"],
    tone: "pratelsky",
    origin: "https://www.mionelo.cz/",
  });
  assert.equal(req.title, "Jak skladovat ořechy");
  assert.equal(req.url, "https://www.mionelo.cz/blog/skladovani-orechu");
  assert.deepEqual(req.channels, ["LinkedIn"]);
  assert.equal(req.tone, "pratelsky");
  assert.ok(req.body.includes("## Proč žluknou"));
});
