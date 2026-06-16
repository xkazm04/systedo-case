# AI Tool Forms (Ads, Brief, Analysis) — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Make every generated asset directly usable by exporting to the platforms it targets
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: src/components/ai/AdGenerator.tsx, src/components/ai/ContentBriefGenerator.tsx
- **Opportunity**: The only path out of these tools is `CopyButton` / "Kopírovat vše" producing a plain-text blob (`copyAllText` in both files). A marketer then re-types everything into Google Ads Editor / Sklik / their CMS. Add structured export: a Google Ads Editor RSA CSV (one row per headline/description with the `pinned` column), a Sklik bulk-import format, and for the brief a Markdown/HTML download plus JSON-LD `FAQPage` schema built from `r.faq`.
- **Value**: This is the single biggest "demo → product" lever: it turns a copy-paste novelty into a workflow that saves an agency 15–30 min per ad group and removes transcription errors. It is also the most credible upsell wedge for a real agency client.
- **Effort**: M
- **Fix sketch**: Add an `exportRsaCsv(r, form.platform)` helper next to `copyAllText` and a download button in `ResultMeta`; for the brief emit `application/ld+json` FAQ schema and a `.md` file from the existing `outline`/`faq` arrays via a Blob + object URL.

## 2. Ground the ad generator and content brief in real Google Ads keyword/competition data
- **Severity**: High
- **Lens**: Both
- **Category**: differentiation
- **File**: src/components/ai/AdGenerator.tsx, src/components/ai/ContentBriefGenerator.tsx, src/lib/ad-strength.ts
- **Opportunity**: Keywords today are pure model invention (`r.keywords` is rendered as pills with no volume, CPC, or competition signal), and the brief's `internalLinks` are model guesses unverified against the real site. The `PerformanceAnalyst` already proves the "grounded in real client data" pattern (it reuses the dashboard dataset). Extend that grounding to ads/brief: attach search-volume/competition/estimated-CPC to each keyword, and validate `internalLinks` against an actual sitemap/URL list.
- **Value**: "Grounded in your real Google Ads + site data, not hallucinated" is the core differentiator versus generic ChatGPT prompting — the same selling point this case study already makes for the analyst tool. It is what justifies a paid tier over free LLM chat.
- **Effort**: M
- **Fix sketch**: Reuse the campaigns dataset/types already imported in `ai-types.ts` (`CampaignPeriod`) to surface per-keyword metrics in the keyword `Group`; add a `KEYWORD_VOLUME` factor to `computeAdStrength` so the strength meter rewards high-intent keywords, not just presence.

## 3. Let users iterate on a result instead of regenerating from scratch — variants, refine, and pin headlines
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/components/ai/AdGenerator.tsx, src/components/ai/PerformanceAnalyst.tsx
- **Opportunity**: Each run fully replaces `data`; there is no way to keep a good headline and reroll the rest, request "more akční variants," compare A/B versions, or pin a headline to position 1 (`RsaPreview` always takes `slice(0,3)` with no pinning, unlike a real RSA). Power users live in iteration loops; this tool only does one-shot generation.
- **Value**: Iteration is what real campaign work looks like and what makes a tool sticky (more sessions, longer engagement, the retention lens). Pinning + variants also map 1:1 onto how Google RSAs actually run, deepening the "this is built by people who know PPC" credibility.
- **Effort**: M
- **Fix sketch**: Add a "Více variant" action that re-runs `run({...form})` and appends rather than replaces; add per-headline pin state passed into `RsaPreview` so pinned items render in fixed positions; expose a `tone`/length "refine" re-prompt that sends the prior `r` back in the payload.

## 4. Turn the analyst's recommended actions into a tracked, closeable loop
- **Severity**: Medium
- **Lens**: Both
- **Category**: user_benefit
- **File**: src/components/ai/PerformanceAnalyst.tsx
- **Opportunity**: `r.actions` renders as a static numbered list that vanishes on the next run. There is no way to accept an action, mark it done, snooze it, assign an owner, or see whether last period's recommendations were acted on. The tool diagnoses but never closes the loop.
- **Value**: An action tracker converts a one-time "interesting summary" into a recurring management ritual the client returns to every month — the clearest route from showcase to retained, billable product, and a natural place to demonstrate ROI ("3 of 4 recommendations implemented").
- **Effort**: M
- **Fix sketch**: Add a checkbox + status (`open`/`done`/`dismissed`) to each `a` in the actions `Group`, persist by a hash of `a.title` (localStorage for the demo), and surface a "z minula splněno X/Y" badge near `r.headline` on the next analysis.

## 5. Add a side-by-side Google-vs-Sklik view and a real Sklik strength model
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: feature
- **File**: src/components/ai/AdGenerator.tsx, src/lib/ad-strength.ts
- **Opportunity**: Platform is a single toggle, so the user generates for Google *or* Sklik and must rerun to compare; yet most Czech campaigns run both. Also, `computeAdStrength` and `RsaPreview` are hard-wired to Google RSA conventions (segmented meter, `HEADLINE_GOAL = 8`, `" | "` join) even when `platform === "sklik"`, where Sklik's text-ad limits and structure differ — the "Sklik" mode currently shows a Google-shaped preview and a Google-shaped strength score.
- **Value**: Dual-platform output in one run is a concrete time-saver and signals deep local-market expertise (Seznam/Sklik is a Czech-specific moat generic tools ignore), reinforcing the agency-client positioning.
- **Effort**: M
- **Fix sketch**: Branch `RsaPreview` and the factor weights/labels in `ad-strength.ts` on `platform` (Sklik uses different headline/description structure); optionally render Google and Sklik previews side by side from one `AdResult` so the toggle becomes a comparison rather than an either/or.
