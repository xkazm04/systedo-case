# Feature + Moonshot Scan — AI Tool Forms (Ads, Brief, Analysis)

> Context: ctx_1781547850532_yf8hzx0
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Negative-keyword suggester + Sklik-aware limit/rule fidelity

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: `src/lib/gemini.ts:AD_SCHEMA/buildAdPrompt` + `src/lib/ai-types.ts:AD_LIMITS` + `src/components/ai/AdGenerator.tsx`
- **Scenario**: The ad generator already emits positive keywords and checks the four headline/description/callout/long-headline character limits, but a real PPC handover needs the *other half* of the keyword plan — negatives — and the limits are hardcoded to Google's RSA spec even when the user picks the Sklik tab. A Sklik ad (`PLATFORM_LABELS.sklik`) has different headline/description allowances and no "long headline" / RSA-combination model, yet `AD_LIMITS` and the `RsaPreview` render Google rules regardless of `form.platform`.
- **Opportunity**: (a) Add a `negativeKeywords: string[]` field to `AdResult`/`AD_SCHEMA` and prompt the model for 6–8 negatives ("free / bazar / recept" style) framed as money-wasters to exclude; render them as a distinct red-tinted `Group` next to "Klíčová slova". (b) Make limits platform-aware: turn `AD_LIMITS` into `AD_LIMITS_BY_PLATFORM` and have `AdGenerator` + the prompt pass the active platform's numbers, and hide the long-headline/RSA framing when `platform === "sklik"`.
- **Impact**: Moves the tool from "drafts copy" to "drafts a launch-ready keyword plan", and removes a credibility gap (showing Google RSA rules on a Sklik ad) that a PPC reviewer of this case study would spot instantly.
- **Implementation sketch**: Extend `AdResult` + `AD_SCHEMA` + `normalizeAdResult` with `negativeKeywords` (use existing `cleanList`); add a line to `buildAdPrompt`; introduce `AD_LIMITS_BY_PLATFORM: Record<Platform, …>` in `ai-types.ts` and thread `platform` into `AdStrengthMeter`/`TextRow` limit props; gate `RsaPreview`'s long-headline copy on `isGoogle`.

## 2. A/B variant sets + side-by-side Ad Strength comparison

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: feature
- **Effort**: M (1-3d)
- **File**: `src/components/ai/AdGenerator.tsx:onSubmit/AdStrengthMeter` + `src/lib/ad-strength.ts:computeAdStrength`
- **Scenario**: `computeAdStrength` produces a clean 0–100 score and a factor checklist for a *single* `AdResult`, but a copywriter iterates: generate set A, tweak the brief or tone, generate set B, and want to know which one Google would rate higher. Today each run overwrites the previous (`useAiTool` holds one `data`), so there's no way to compare two angles or two tones.
- **Opportunity**: Keep a small client-side history of the last 2–3 generated sets (with their `AdStrength` already memoized in the component) and add a "Porovnat varianty" toggle that renders the meters and factor deltas side by side — e.g. "Varianta B: +12 bodů, lepší pokrytí klíčových slov, horší délková rozmanitost". Each variant remembers the brief (`form` snapshot) that produced it.
- **Impact**: Turns the strength meter from a static badge into a decision tool, demonstrating the optimization loop a PPC specialist actually runs and giving the case study a memorable interactive moment.
- **Implementation sketch**: Add a `variants: { req: AdRequest; res: AdResult; strength: AdStrength }[]` `useState` in `AdGenerator`, push on each `done`; add a `diffFactors(a, b)` helper in `ad-strength.ts` (compare `factors[i].status` + score) and a compact `<VariantCompare>` block reusing `AdStrengthMeter`/`RATING_STYLE`. No backend change — all derived from existing client state.

## 3. Bulk CSV export to Google Ads Editor / Sklik import format

- **Severity**: High
- **Lens**: feature-scout
- **Category**: integration
- **Effort**: S (<1d)
- **File**: `src/components/ai/AdGenerator.tsx:copyAllText/ResultMeta` + new `src/lib/ad-export.ts`
- **Scenario**: The only way to get generated ads out today is `copyAllText` — a plain-text blob with Czech headers ("NADPISY:", "POPISKY:"). A PPC specialist's real next step is pasting into **Google Ads Editor** (or Sklik's bulk import), which expects a specific column layout (Campaign, Ad group, Headline 1…15, Description 1…4, Path 1/2, Final URL). The current copy output requires manual reshaping, breaking the "generate → launch" flow the case study is selling.
- **Opportunity**: Add a "Stáhnout CSV (Google Ads Editor)" button next to "Kopírovat vše" that serializes the `AdResult` into the RSA bulk-upload column shape (mapping `headlines[]`→Headline 1..N, `descriptions[]`→Description 1..4, `slugify(keywords[0])`→Path 1, `longHeadline` where supported), with a Sklik-shaped variant when `platform === "sklik"`. Build the negatives column from Idea #1 if present.
- **Impact**: This is the concrete, low-effort bridge that makes the whole tool feel production-real rather than a demo — exactly the "deeper ad-platform fidelity / bulk CSV export" the context calls for, and a strong portfolio talking point.
- **Implementation sketch**: New pure `src/lib/ad-export.ts` with `toGoogleAdsEditorCsv(res, meta)` / `toSklikCsv(res)` returning a CSV string (BOM + `;` separator for Czech Excel); add a download button in `AdGenerator` using a `Blob`/`URL.createObjectURL` click, alongside `ResultMeta`'s copy button. Pure + unit-testable; no route change.

## 4. Closed-loop "generate → publish → measure" — wire ad/brief output back to the campaign store

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: L (>3d)
- **File**: `src/lib/campaigns/store.ts` + `src/lib/gemini.ts` (Tools 1 & 4) + `src/components/ai/AdGenerator.tsx`/`PerformanceAnalyst.tsx`
- **Scenario**: The app already has both halves of a learning loop but they're disconnected. Tool 1 *generates* ads (ephemeral, thrown away on reload). Tool 4 (`generateCampaignEvaluation`) + `store.ts` *measure* campaigns and persist `reports`/`reportHistory` with score-over-time. Nothing connects a generated ad set to the campaign whose `AnalysisResult`/`CampaignReportResult` later judges it — so the system can never say "the headlines you generated for *Search – Brand* moved CTR from X to Y."
- **Opportunity**: Persist generated ad sets to SQLite (mirroring `saveReport`), let the user attach a generated set to a `Campaign` id, and feed the campaign's synced metrics back: the `PerformanceAnalyst`/campaign-eval prompt gains a "since you published these creatives, CTR/ROAS moved …" section, and the Ad Strength score gets a real-world companion ("predicted Výborná → actual CTR 4.1%"). The `Campaign` model already carries `impressions/clicks/conversions/conversionValue`, and `getReportHistory` already proves the score-timeline pattern.
- **Impact**: Transforms three separate "AI toys" into one defensible product story — a measurable creative-optimization loop with a memory and a verdict — which is the single most valuable narrative this case study can demonstrate to a marketing-analytics employer.
- **Implementation sketch**: Add an `ad_sets` table + `saveAdSet`/`getAdSetsForCampaign` in `store.ts` (clone `saveReport`/`toReport`); add `campaignId?: string` to `AdRequest` and a campaign picker (reuse `listCampaigns`) in `AdGenerator`; thread the campaign's `withMetrics(...)` row into `buildAnalysisPrompt`/`buildCampaignPrompt` as a "creatives published vs. result" block; surface a "predicted vs. actual" badge by pairing stored `computeAdStrength` with the campaign's live CTR/ROAS.

## 5. "Marketing Copilot" — one brief, a coordinated PPC + SEO + landing-page package with cross-tool grounding

- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: L (>3d)
- **File**: new `src/app/api/ai/*` orchestration over `src/lib/gemini.ts` (`generateAds`, `generateBrief`, `generateAnalysis`) + a new `CopilotConsole` component
- **Scenario**: The three tools today are siloed forms the user fills in three times. A product/audience entered into the Ad generator never reaches the Brief builder; the Brief's keywords never seed the Ad's negatives; the performance Analysis never informs which product to write ads for next. Yet they share an envelope (`AiResponse<T>`, `generateStructured`) and a domain (one client, Mionelo).
- **Opportunity**: A single "campaign kit" entry point: the user describes a product/goal once, the analysis tool first reads the dashboard `Snapshot` to recommend *which* product/channel to push, then `generateBrief` and `generateAds` run in sequence with shared grounding — the brief's `keywords` become the ad's positive keywords, the analysis's weakest channel becomes a targeting note, and the whole kit (SEO brief + RSA set + a one-paragraph rationale of *why this product now*) exports together (tying into Idea #3's CSV). Demo fallbacks already exist for each, so the orchestration degrades gracefully keyless.
- **Impact**: Repositions the case study from "here are three calculators" to "here is an agent that turns business data into a launch-ready, internally-consistent campaign package" — a category-defining framing with a genuine, incremental path because every underlying generator already exists and is independently working.
- **Implementation sketch**: Add an orchestration route that calls `generateAnalysis` → `generateBrief` → `generateAds` (passing the brief's `keywords`/`primaryKeyword` into `AdRequest`), aggregating into a `CampaignKitResult`; build `CopilotConsole` reusing `RsaPreview`, `SerpPreview`, `AdStrengthMeter`, and the analysis result blocks; reuse `useAiTool` with a `kit` mode and a stepper UI driven by the existing `status` lifecycle. Start by chaining two tools (analysis-grounded brief) behind a flag before adding ads.
