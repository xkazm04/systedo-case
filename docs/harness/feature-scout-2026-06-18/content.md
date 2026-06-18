# Feature Scout — Obsah & SEO (`/app/[projectId]/obsah`)

> Module: src/components/app/modules/ContentModule.tsx
> Project type: all
> Total: 5 ideas

## 1. Brief → návrh článku (one-click draft) generation
- **Category**: functionality
- **Impact**: 9
- **Effort**: 6
- **Risk**: 4
- **Gap today**: The brief stops at a skeleton — `BriefResult` is title/meta/outline-points/FAQ/keywords/link-names (`ai-types.ts:129-139`); `ContentBriefGenerator.tsx` renders it and exports flat `.md` (`exportBriefMarkdown`, line 116). Meanwhile a full headless-CMS `Article` model with a renderer + JSON-LD pipeline already exists (`lib/article.ts`, `app/clanek/page.tsx`), and `snapshot-to-article.ts` already proves the "build a typed Article programmatically" pattern — yet nothing turns a *brief* into an article draft. The "Publikovaný článek" card (`ContentModule.tsx:39`) is a dead-end demo, not the brief's output.
- **Proposal**: Add a "Rozepsat článek" action on a finished brief that calls a new `mode: "draft"` AI tool. Feed it the approved outline + FAQ + grounding keywords; have it emit the existing typed `Block[]` + `FaqItem[]` shape (paragraphs, lists, callouts, CTA) so it drops straight into `ArticleBody`/JSON-LD. Render the draft in an editable preview reusing `/clanek` styling; export `.md` and the article JSON.
- **User value**: Closes the brief→draft→publish loop the module's own blurb promises ("publikované články"). The marketer leaves with a near-publishable article, not homework.
- **Fit**: Reuses `Article`/`ArticleBody`/JSON-LD that already exist and the `generateBrief` server pattern (`api/ai/route.ts:74`); makes the module's two halves (brief + published-article surface) one workflow. All project types.

## 2. Validate & autocomplete internal links against real site URLs
- **Category**: functionality
- **Impact**: 8
- **Effort**: 4
- **Risk**: 3
- **Gap today**: `internalLinks` are model-invented plain strings rendered as a static bullet list (`ContentBriefGenerator.tsx:336-345`) with no URL, no existence check, no anchor text — a writer can't act on "odkaz na kategorii ořechy". The article model treats links as first-class typed objects (`Inline` with `kind: "internal"|"external"|"anchor"`, `article.ts:8-11`), so the data exists to do this properly.
- **Proposal**: Resolve each suggested internal link to a real candidate URL from the project (sitemap/known routes/saved keyword lists), show match confidence, and let the user accept → it becomes a typed `{text, href, kind:"internal"}` Inline carried into the draft (idea #1). Flag unresolved links as "stránka neexistuje — zvážit vytvořit" (a content-gap signal).
- **User value**: Internal links that actually work, with real anchor text — the single highest-leverage on-page SEO task, currently fake.
- **Fit**: Directly serves the module's "prolinkování" promise and the typed-link model already in `article.ts`; pairs naturally with the keyword module's saved lists.

## 3. SERP snippet preview with pixel-width truncation + readability/E-E-A-T scoring
- **Category**: user_benefit
- **Impact**: 7
- **Effort**: 4
- **Risk**: 2
- **Gap today**: `SerpPreview` (`ContentBriefGenerator.tsx:41-56`) is a static mock; truncation is judged only by character count vs `SEO_LIMITS` (`SeoLine`, line 58). Google truncates by **pixel width**, not characters, so a 58-char title can still be cut. There's no readability or E-E-A-T check anywhere despite the article model carrying E-E-A-T author fields (`article.ts:82-88`).
- **Proposal**: Make the SERP preview pixel-accurate (measure title/meta in the SERP font, show the real "…" cut and a desktop/mobile toggle). Add a compact scorecard for the draft/outline: readability (sentence length, passive voice, paragraph length), keyword-in-H1/title/first-paragraph coverage, and E-E-A-T hints (author byline present, sources/external links cited, dateModified set) — each a green/amber/red chip with a one-line fix.
- **User value**: The marketer sees exactly how the result looks in Google and what's weak before publishing, instead of trusting a char counter.
- **Fit**: Upgrades the preview/limit UI already in the module and surfaces the E-E-A-T/freshness fields the article pipeline already supports. All types.

## 4. Saved briefs library (name, persist, reopen, status)
- **Category**: functionality
- **Impact**: 7
- **Effort**: 5
- **Risk**: 3
- **Gap today**: A brief survives only as the single last-result blob in localStorage (`useAiTool.ts:9,73`) — generate a second brief and the first is gone. The keyword module already has the opposite: named, persisted lists via `/api/keywords/lists` with save/saved states (`KeywordResearch.tsx:115-141`). Content, the module that should manage an editorial pipeline, has no such persistence.
- **Proposal**: Add `/api/content/briefs` (JSON-in-repo, mirroring the keyword-lists store) plus a "Uložené briefy" panel in the module: save a generated brief under a name, list them with a status (brief → koncept → publikováno per idea #1), reopen to re-seed the form, delete. Gate on auth like keyword save.
- **User value**: Turns a one-shot tool into an editorial backlog — plan ten articles, come back, track which are drafted/published.
- **Fit**: Reuses the exact saved-lists pattern from the sibling keyword module; gives the content module the stateful surface its "publikované články" framing implies. All types.

## 5. JSON-LD / schema generator for the brief (FAQPage, Article, HowTo, BreadcrumbList)
- **Category**: feature
- **Impact**: 6
- **Effort**: 3
- **Risk**: 2
- **Gap today**: The brief already produces FAQ Q&A pairs (`BriefResult.faq`) and SEO metadata, and the published-article page hand-rolls a full `@graph` (Article + FAQPage + ImageObject + BreadcrumbList, `app/clanek/page.tsx:54-99`). But the brief tool gives the writer **none** of that structured data — they'd have to recreate schema by hand on whatever CMS they publish to.
- **Proposal**: From the brief, emit copy-pasteable JSON-LD: a `FAQPage` from `r.faq`, an `Article`/`BlogPosting` stub from title/meta/slug/contentType, and (for how-to outlines) a `HowTo`. Add a "Kopírovat JSON-LD" / "Stáhnout .json" action next to the existing `.md` export, plus a validity hint (e.g. FAQPage needs ≥2 questions).
- **User value**: Rich-result eligibility (FAQ accordions, stars) in seconds, regardless of where the article is published — a concrete SEO win non-technical marketers can't produce themselves.
- **Fit**: Reuses the brief's existing FAQ/metadata and the schema shapes already authored in `clanek/page.tsx`; complements the .md export with the structured-data half. All types.
