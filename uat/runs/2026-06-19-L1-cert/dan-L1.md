# L1 Certification — Dan (performance creative) — Creative Studio

- **Skill under test:** simulated UAT
- **Cert level:** L1 (theoretical / source-only — no app run, no browser)
- **Character:** Dan — performance creative / designer (`uat/characters/dan-performance-creative.md`)
- **Journey:** Generate on-brand ad/product visuals fast enough to feed testing, without looking AI-generated (`uat/journeys/generate-on-brand-creatives.md`)
- **Entry:** Creative Studio — `/app/[projectId]/kreativa`; product half `/app/[projectId]/produktova-kreativa`
- **Date:** 2026-06-19
- **Verdict:** **L1-pass (with material caveats)** — the *flow* is well-shaped (variants → vision best-of-N → iterate → export, plus demo fallback), but the single most load-bearing thing in Dan's rubric — **on-brand grounding (palette/type/feel) and product accuracy** — is **structurally absent** from the prompt path. Image quality itself is undecidable at L1 → defer to L2.

---

## 1. Surface model (cited)

### 1.1 Routes / composition
- `src/app/app/[projectId]/kreativa/page.tsx:9-17` — server page, `requireProjectModule(projectId, "kreativa")`, renders `<ModulePage moduleKey="kreativa"><CreativeStudio /></ModulePage>`. **Note:** the module page renders `CreativeStudio` *alone* — the `CreativeAttribution` panel is **not** mounted here.
- `src/app/app/[projectId]/produktova-kreativa/page.tsx:9-18` — renders `<CatalogModule products={SAMPLE_PRODUCTS} />`. This is **text/asset-group generation (RSA/PMax copy), not image generation** — the "product creative" route produces ad copy, not product visuals.
- `src/components/ai/AiAssistant.tsx:115-118` — the *older* tabbed assistant is the only place `CreativeStudio` + `CreativeAttribution` render together. So the style-prior/leaderboard UI is reachable from `AiAssistant`, not from the `/kreativa` module route Dan enters.

### 1.2 CreativeStudio affordances / inputs / state (`src/components/ai/CreativeStudio.tsx`)
- **Inputs:** free-text prompt (`prompt`, ≥2 chars to submit, `:150`); style picker — 6 styles (`IMAGE_STYLES`, `:267-282`); format — 4 presets (square/4:5/16:9/9:16, `:284-299`); candidate count 1–4 (`COUNTS`, `:24` / `:301-316`); optional **reference image** upload for image-to-image style guidance (`:318-347`, `onRefSelect` `:152-177`).
- **Sample-fill** button injects a Czech demo prompt (`:247-253`) — "Ploché aranžmá ořechů a semínek…" (no brand tokens in it).
- **State:** `status` idle/loading/done/error (`:62`), `result: ImageGenResult` (`:63`), `library: CreativeSummary[]` (`:66`), per-image `nobg` map (`:69`).
- **Submit → `generate()`** `:186-215` → `POST /api/images` with `{prompt, style, format, count, avoid?, referenceImageId?}`.
- **Result render** `:390-424`: source pill ("Leonardo · Gemini hodnocení" vs "Ukázkový režim (bez LEONARDO_API_KEY)", `:393-397`); a 2-col grid of `Candidate` tiles.
- **Candidate tile** `:482-566`: shows image, **winner ring + "Nejlepší" badge** (`:513-518`), **score pill `N/10`** (`:519-521`), defects one-liner (`:527-529`), and per-tile actions: **Varianty** ("more like this", `:531-540`), **Bez pozadí** (background removal, `:541-550`), **Download** (`:551-558`).
- **Iterate affordance** "Vylepšit podle defektů" `:398-407` — only enabled when `result.source === "leonardo"` AND winner has `defects` (`canIterate`, `:223`); calls `generate(winner.defects)` which sends `avoid` to the API.
- **Library** `:429-477` — persisted winners (signed-in), each with score pill, relative time, **download link** (`:453-460`) and delete (`:461-469`); thumbnails stream from `/api/images/file/{id}`.

### 1.3 Generation orchestration (best-of-N) — `src/lib/images/studio.ts`
- `generateImageSet()` `:50-92` is the **generate → recognize → rank loop**:
  1. If `!leonardoConfigured()` → `demoResult()` (`:54-56`).
  2. Prompt assembly: `withPrior = prior ? prior + "\n\n" + prompt : prompt` (`:58`); `fullPrompt = avoid ? withPrior + "\n\nVyhni se: " + avoid : withPrior` (`:59`). **This is the entire prompt-grounding surface** — user text + optional learned style-prior hint + optional defects-to-avoid. **No brand palette/type/logo/product reference is ever injected.**
  3. `generateCandidates(fullPrompt, {width,height,style,count,imagePromptIds})` (`:60-66`).
  4. **Best-of-N selection:** each candidate is scored in parallel by `rateImage()` (`:69-83`), then `images.sort((a,b)=>(b.score??0)-(a.score??0))` and `images[0].winner = true` (`:84-85`). This is a real evaluation/selection step, not one-shot.
- Demo fallback `demoResult()` `:122-137`: deterministic SVG gradient per candidate, hue derived from `hash(prompt:i)` (`:96-103`, `:105-119`); first tile is `winner`, all `score: null`, `defects: "ukázkový režim"`, `source: "demo"`.

### 1.4 Vision scoring / "no AI artifacts" check — `src/lib/leonardo/rate.ts`
- `rateImage(base64, mime, intendedPrompt)` `:22-68` calls Gemini multimodal. Instruction (`:30-34`) explicitly asks the model to score 1–10 for **visual quality, prompt adherence, cleanliness, and absence of typical AI artifacts / mangled text**, returning `{score, defects}` JSON. Robust: strips markdown fences, regex-fallback parse, **never throws** — null score on any failure (`:28`, `:47`, `:65`).
- Requires `GEMINI_API_KEY`; without it returns `{score:null, defects:"bez GEMINI_API_KEY"}` (`:27-28`). So with a Leonardo key but no Gemini key, you get **images but no scoring/ranking** (winner falls to index 0).

### 1.5 Leonardo client — `src/lib/leonardo/client.ts`
- Lucid Origin model (`:9`), 6 style UUIDs (`:11-18`) mapped from `ImageStyle`. `generateCandidates()` `:98-142`: POST `/generations` with `num_images=count`, `contrast 3.5`, `styleUUID`, optional `imagePrompts` (reference-image ids); polls to COMPLETE (40×3s, `:20-21`/`:51-61`), downloads bytes. `uploadInitImage()` `:79-94` (presigned S3) for reference images. `removeBackground()` `:158-175` (nobg variation → transparent PNG). `leonardoConfigured()` = `Boolean(process.env.LEONARDO_API_KEY)` (`:23-25`).

### 1.6 API — `src/app/api/images/route.ts`
- POST `:43-159`: payload-size guard, IP rate-limit (aiPerMin/aiPerDay), concurrency slot, prompt 2–500 chars (`:65`), style/format validation (`:68-69`), count clamp 1–4 (`:70`). Pulls **style prior** for signed-in tenants (`getStylePrior`, `:79-85`), enforces a **per-user daily `image` quota** (`:88-99`, 429 + upgrade URL), calls `generateImageSet`, persists the **winner only** (signed-in + live, `:113-130`), strips buffers, returns `ImageGenResult`. GET = library list; DELETE = remove by id.
- Other routes: `nobg/route.ts` (bg removal, requires key, `:38-39`); `upload-ref/route.ts` (8 MB cap, PNG/JPG/WEBP, requires key, `:32-51`); `file/[id]/route.ts` (tenant-scoped private byte stream, `:11-25`).

### 1.7 Attribution / style-prior loop — `src/lib/images/attribution*.ts`, `CreativeAttribution.tsx`
- `styleLeaderboard()` ranks styles by ROAS then avg vision score (`attribution-types.ts:59-89`); `deriveStylePrior()` picks the best-earning (or best-scored) style and emits a Czech hint (`:99-114`). `getStylePrior()` (`attribution.ts:72-76`) is read by the generate route and prepended to the prompt — a closed creative→revenue→next-gen loop. **But** the panel that records performance + shows the leaderboard only renders inside `AiAssistant`, not on `/kreativa`.

### 1.8 Demo-mode (no LEONARDO_API_KEY) behavior — summary
- Studio returns `source:"demo"` SVG placeholders (`studio.ts:122-137`); pill says "Ukázkový režim" (`CreativeStudio.tsx:396`). **Disabled in demo:** scoring (all `null/10`), **Varianty** + **Bez pozadí** (gated on `leonardoImageId`, which demo images lack, `:531`/`:541`), iterate ("Vylepšit podle defektů", gated on `source==="leonardo"`, `:223`), and library persistence (only persists when `source==="leonardo"`, route `:113`). **Still works in demo:** the full input UI, N deterministic tiles, winner badge, and **Download** (downloads the SVG via `downloadDataUrl`, `:499-503`). So Dan can *assess the flow* keyless, but every image-quality-bearing affordance is dark.

---

## 2. Cognitive walkthrough, in character (on the designed experience)

**Step 0 — land on /kreativa.** Clean studio: prompt box, style chips, format chips, count, reference upload, one CTA. Helper text spells out the model ("Leonardo vygeneruje N návrhů, Gemini je ohodnotí a vybere nejlepší. Bez klíče běží ukázkový režim.", `:367-370`). *Dan:* "Good — it tells me up front there's a scoring step and a keyless mode. That's honest." **Clarity: high.**

**Step 1 — set up a shot.** Six styles, four ad formats including 9:16 story and 4:5 — *the* formats the media team tests. Count up to 4. Reference-image upload for style guidance. *Dan:* "Formats are exactly right for paid social. But where do I tell it my brand? There's no palette, no logo, no font, no 'brand kit'. The only style control is six generic Leonardo presets — 'Dynamický', 'Fashion', 'Bokeh'. That's a *look*, not *my* look." **This is the cliff.** The one lever he has is the reference image — and only if he has a Leonardo key. **Missing: high.**

**Step 2 — generate (live).** N candidates come back, each scored 1–10 by Gemini vision with a defects one-liner, best gets a ring + "Nejlepší". *Dan:* "A best-of-N with an actual evaluation step and a defects readout — this is more than Midjourney gives me. The vision prompt even checks for 'AI artefakty / zmršený text' (`rate.ts:32`), which is the exact thing I reject for." **Completion + senior-quality scaffolding: strong on paper.**

**Step 3 — judge on-brand-ness.** *Dan:* "Here's my problem. Nothing fed the model my colors or product. The score measures 'looks clean + matches the prompt', not 'matches my brand'. A 9/10 can still be off-brand or an invented product. The selection is best-of-N by *generic quality*, not best-by-*brand-fit*." **Trust: medium-low** — the scaffolding is real, but it's optimizing the wrong objective for his rubric.

**Step 4 — product accuracy.** *Dan:* "If I want my actual product in the shot, my only path is uploading it as a reference image — and 'imagePrompts' style-guidance on a diffusion model is *influence*, not a faithful product render. There's no product-locked compositing, no catalog-image pipeline into the studio. The product half of the app (/produktova-kreativa) generates *ad copy*, not product visuals. So 'product-accurate visual' has no real home." **Missing: high; this is a journey-defining gap.**

**Step 5 — iterate.** "Vylepšit podle defektů" re-runs with the winner's defects as a negative ("Vyhni se: …"), and "Varianty" re-seeds from a chosen candidate as a reference. *Dan:* "I like that the defects feed back. That's a genuine refine loop." **Effort: low, good.**

**Step 6 — export / hand off.** Per-candidate Download, plus background-removal to a transparent PNG (huge for compositing), plus a persisted library with per-asset download. *Dan:* "Export is there and the cut-out is a real pro touch. PNG transparent is what I'd hand the media team." **Export-ready: yes (live mode).**

**Step 7 — demo mode (no key, the seeded state).** *Dan:* "Without a key I get colored SVG rectangles with my prompt text printed on them. I can *see the flow* — inputs, N tiles, a winner, download — but I can't judge a single thing I'm actually hired to judge. No scoring, no variants, no bg-removal, no save. Fine as a wireframe demo; useless as a creative tool." **Time-saved in demo: zero; the design correctly signals this rather than faking output.**

**Step 8 — the learning loop he never sees.** The style-prior (which look earns) and the performance-recording panel live in `AiAssistant`, not on `/kreativa`. *Dan:* "There's a smart creative→revenue→next-gen loop in the code, but on the route I actually enter I can't see the leaderboard or record performance. The prior still applies silently server-side, which is good, but the feedback UI is orphaned from my entry point."

### Dimension scorecard (designed experience, live mode unless noted)
| Dimension | Rating | Basis |
|---|---|---|
| Completion | **High** | Full generate→score→pick→iterate→export→library path exists. |
| Effort | **Low/Good** | One CTA, sensible defaults, sample-fill, defect-feedback iterate. |
| Clarity | **High** | Helper text + source pill state the pipeline and demo mode honestly. |
| Trust | **Medium-low** | Real vision scoring + winner, but it ranks generic quality, not brand-fit; score can mislead on "on-brand". |
| Missing | **High** | No brand grounding (palette/type/logo), no product-accurate render path, attribution UI orphaned from /kreativa. |
| Time-saved | **High (live) / Zero (demo)** | Minutes-to-N-variants beats half a day in Figma *if* output is usable; demo produces nothing usable. |
| Senior-quality | **Undecidable at L1** | Whether output is ship-quality (on-brand, no AI tells) depends on actual pixels → **defer to L2**. |

### Dan's scored acceptance criteria
- [~] **On-brand + product-accurate** — *partially structurally supported.* Style presets + reference-image guidance exist; **no brand-token grounding and no faithful-product path.** On-brand-ness of actual output = L2.
- [x] **Multiple usable variants + selection/evaluation step** — **structurally present and good** (1–4 candidates, Gemini best-of-N, winner, defects, iterate).
- [x] **Export-ready** — **present** (download, transparent-PNG cut-out, library) in live mode.
- [?] **Faster than by hand** — **plausible in live mode** (minutes vs half a day); **fails in demo mode**; net = L2 on real latency + output usability.

---

## 3. L1 findings

```json
[
  {
    "id": "DAN-L1-01",
    "cert_level": "L1",
    "type": "confirmed-absent",
    "dimension": "missing",
    "severity": "high",
    "title": "No brand grounding (palette / type / feel) anywhere in the prompt path",
    "expected": "Dan can ground generation in his brand — palette, typography, logo, tone — so output is on-brand by construction, not by luck.",
    "got": "The full prompt is user free-text + optional learned style-prior hint + optional defects-to-avoid. The only 'style' control is 6 generic Leonardo style UUIDs. No brand-kit concept exists in the repo.",
    "evidence": "src/lib/images/studio.ts:58-59 (fullPrompt assembly); src/components/ai/CreativeStudio.tsx:267-282 (generic style chips); grep brand|palette|brandKit over src/lib/images + src/lib/leonardo = no matches",
    "code_check": "PASS — confirmed absent by reading studio.ts prompt assembly and grepping brand/palette/brandKit across src/lib/images and src/lib/leonardo (0 hits).",
    "suggested_acceptance": "A brand profile (colors as hex, font/typographic feel, optional logo/reference set) is selectable in the studio and is injected into the Leonardo prompt and/or fed as imagePrompts on every generation; the vision scorer's adherence check references the brand profile."
  },
  {
    "id": "DAN-L1-02",
    "cert_level": "L1",
    "type": "confirmed-absent",
    "dimension": "missing",
    "severity": "high",
    "title": "No product-accurate render path; product reference is style-guidance only",
    "expected": "When a product is shown, it must look like the real product (Dan: 'the product's wrong, customers will notice').",
    "got": "The only product-injection is uploading a reference image used as Leonardo imagePrompts (diffusion influence, not faithful compositing). The /produktova-kreativa route generates ad COPY (RSA/PMax assets), not product visuals.",
    "evidence": "src/lib/leonardo/client.ts:119-121 (imagePrompts comment: 'reference images'); src/app/app/[projectId]/produktova-kreativa/page.tsx:15 (CatalogModule = copy); src/components/app/modules/CatalogModule.tsx:266-310 (text assets only)",
    "code_check": "PASS — confirmed: reference image flows to imagePrompts (style influence), and the product route renders text asset groups, with no product-locked image pipeline.",
    "suggested_acceptance": "From the catalog, a product image can be sent into the studio as a locked subject (controlnet/product-swap or compositing), and the vision scorer flags product mismatch as a defect; or the route honestly scopes out faithful product rendering."
  },
  {
    "id": "DAN-L1-03",
    "cert_level": "L1",
    "type": "needs-L2",
    "dimension": "senior-quality",
    "severity": "high",
    "title": "On-brand-ness and AI-artifact-freeness of actual output is undecidable at L1",
    "expected": "Output a senior creative would ship — on-brand palette/feel, product-accurate, no tell-tale AI artifacts.",
    "got": "The vision prompt explicitly scores for AI artifacts/mangled text and the studio picks the best — but whether real Leonardo Lucid-Origin pixels clear Dan's bar can only be seen by generating with a live key.",
    "evidence": "src/lib/leonardo/rate.ts:30-34 (artifact check in scoring); src/lib/images/studio.ts:69-85 (best-of-N); src/lib/leonardo/client.ts:9 (Lucid Origin model)",
    "code_check": "N/A at L1 — requires running generation with LEONARDO_API_KEY + GEMINI_API_KEY.",
    "suggested_acceptance": "L2: with both keys, generate 3-4 sets across styles/formats; manually judge on-brand-ness, product fidelity, AI-tell artifacts, and whether the vision winner correlates with a senior's pick."
  },
  {
    "id": "DAN-L1-04",
    "cert_level": "L1",
    "type": "design-gap",
    "dimension": "trust",
    "severity": "medium",
    "title": "Selection optimizes generic quality, not brand-fit — the winner score can mislead",
    "expected": "Best-of-N should pick the most on-brand / product-accurate candidate, the thing Dan actually selects on.",
    "got": "rateImage scores visual quality + adherence to the free-text prompt + cleanliness/artifacts. With no brand profile in scope, a high score does not imply on-brand; the 'Nejlepší' badge can crown an off-brand image.",
    "evidence": "src/lib/leonardo/rate.ts:30-34 (criteria); src/lib/images/studio.ts:84-85 (winner = max score); CreativeStudio.tsx:513-521 (winner badge + score pill)",
    "code_check": "PASS — winner is purely max vision score; no brand/product term in the scoring objective.",
    "suggested_acceptance": "Once a brand profile exists (DAN-L1-01), the vision rubric scores brand-fit and product-accuracy as named sub-criteria, and the winner is chosen on a brand-weighted score (or the UI shows per-criterion sub-scores so Dan can override)."
  },
  {
    "id": "DAN-L1-05",
    "cert_level": "L1",
    "type": "design-gap",
    "dimension": "missing",
    "severity": "medium",
    "title": "Attribution / style-prior UI is orphaned from the /kreativa entry point",
    "expected": "From where Dan generates, he can see which styles earn and record performance, closing the learn-from-results loop visibly.",
    "got": "The /kreativa module page renders <CreativeStudio /> only. The CreativeAttribution leaderboard + performance-recording panel render only inside the legacy AiAssistant tab. The prior still applies silently server-side.",
    "evidence": "src/app/app/[projectId]/kreativa/page.tsx:12-16 (CreativeStudio only); src/components/ai/AiAssistant.tsx:115-118 (Studio + Attribution together); src/app/api/images/route.ts:79-85 (prior applied server-side)",
    "code_check": "PASS — confirmed CreativeAttribution is not mounted on the kreativa route; only in AiAssistant.",
    "suggested_acceptance": "Mount CreativeAttribution under CreativeStudio on the /kreativa module page (as AiAssistant does), so the leaderboard/prior and performance recording are visible from the generation entry point."
  },
  {
    "id": "DAN-L1-06",
    "cert_level": "L1",
    "type": "observation",
    "dimension": "time-saved",
    "severity": "low",
    "title": "Demo mode is a faithful wireframe but produces nothing Dan can use or judge",
    "expected": "Even keyless, give enough to evaluate the flow (acknowledged in the journey).",
    "got": "Demo returns deterministic SVG placeholders with the prompt printed on them; scoring, Varianty, Bez pozadí, iterate, and library persistence are all correctly disabled. Flow is assessable; output is not.",
    "evidence": "src/lib/images/studio.ts:105-137 (demo SVG); CreativeStudio.tsx:223,531,541 (live-only gating); studio source pill :396",
    "code_check": "PASS — demo behavior and the live-only gating verified in source.",
    "suggested_acceptance": "Acceptable for L1 flow assessment. For a stronger keyless demo, ship a few baked sample result sets (real-looking images + scores) so Dan can judge selection/iterate UX without a key."
  },
  {
    "id": "DAN-L1-07",
    "cert_level": "L1",
    "type": "needs-L2",
    "dimension": "time-saved",
    "severity": "medium",
    "title": "Real time-to-usable-set unverified (latency + per-day quota under live keys)",
    "expected": "A usable on-brand set in minutes, repeatedly enough to feed weekly testing.",
    "got": "Leonardo polls up to 40x3s (~2 min) per generation plus parallel vision scoring; a per-user daily image quota caps volume. Whether N usable variants land in 'minutes' and survive the quota is not testable at L1.",
    "evidence": "src/lib/leonardo/client.ts:20-21,51-61 (poll budget); src/app/api/images/route.ts:88-99 (daily quota); studio loading copy CreativeStudio.tsx:384-386 ('může trvat i půl minuty')",
    "code_check": "N/A at L1 — needs live timing + quota-limit run.",
    "suggested_acceptance": "L2: measure wall-clock to a 4-candidate scored set across formats; confirm the daily image quota supports a weekly creative batch (or document the plan needed)."
  }
]
```

---

## 4. L1 verdict

**L1-pass (with material caveats).**

The *designed flow* clears the structural bar for three of Dan's four scored criteria: **multiple variants with a real best-of-N selection step** (Leonardo N-candidates + Gemini vision ranking + winner + defects), **iteration** (defect-avoid + variations), and **export-ready output** (download, transparent-PNG cut-out, persisted library) — all honestly gated behind a clearly-labeled demo mode. The vision rubric even targets the exact failure Dan rejects for ("AI artefakty / zmršený text").

It is **not L1-fail**, because the journey's spine is present and coherent. But two `confirmed-absent` high-severity gaps sit directly on Dan's #1 criterion: **there is no brand grounding** (no palette/type/logo/brand-kit anywhere in the prompt path — DAN-L1-01) and **no product-accurate render path** (reference image = diffusion style-influence only; the "product" route makes copy, not visuals — DAN-L1-02). As a result the best-of-N optimizes *generic* quality, not *brand-fit* (DAN-L1-04). Whether the actual pixels are on-brand and artifact-free is **undecidable at L1 and must go to L2** (DAN-L1-03, -07).

---

## 5. Character feedback — Dan, first person

"Okay — the *machinery* is better than I expected from an AI image tool. You give me 1–4 candidates, you actually *score* them with vision and ring the best one, you show me a defects line, and the refine button feeds those defects back as a negative prompt. That's a real best-of-N with a selection step, which is exactly what Midjourney and DALL·E never gave me. The formats are dead-on for paid social — 9:16 story, 4:5 — and the background-removal to a transparent PNG is a genuinely pro touch; that's the asset I'd hand the media team. Export is there, the library's there. Clarity's good too — you tell me up front there's a scoring pass and a keyless demo, you don't pretend.

But here's where I stop trusting it: **nowhere do I give you my brand.** No palette, no typeface, no logo, no 'brand kit'. My only style controls are six generic Leonardo presets — 'Dynamický', 'Fashion', 'Bokeh' — that's a *vibe*, not *my* brand. So when you crown a 'Nejlepší' at 9/10, you're scoring *clean and matches-the-prompt*, not *matches-my-brand* — the winner can be a beautiful, off-brand image, and the badge makes me trust it more than I should. And the product. If a product's in the shot it has to be *the* product or customers notice — but the only way to get my product near this is uploading it as a 'reference', which on a diffusion model is a hint, not a faithful render. The route literally called 'product creative' generates ad *copy*, not product shots. So the one thing I'm hired to protect — on-brand, product-accurate — is the one thing the tool can't guarantee.

Demo mode? Honest wireframe, useless creatively — colored rectangles with my prompt typed on them, no score, no variants, no cut-out. Fine for seeing the buttons, but I can't judge a single pixel, so I can't tell you if I'd ship it. Give me a brand profile that actually drives the prompt *and* the scoring, a real product-lock path, and a handful of baked sample results for the keyless demo — then I'll believe the minutes-not-half-a-day promise. Right now the *flow* would save me time; whether the *output* is something I'd put my name on, I genuinely can't tell from here."
