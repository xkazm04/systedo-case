# Marketing Landing Pages

> Total: 5
> Critical: 0 · High: 0 · Medium: 3 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Visibility-gauge card renders the wrong subtitle (competitor copy)

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/marketing/LocalSeoShowcase.tsx:204`
- **Scenario**: On `/lokalni-seo`, the three chart cards are built at lines 199–214. The middle card is `<ChartCard title={c.visTitle} sub={c.compSub}>` (line 204) — it shows the title "Map-pack visibility" / "Viditelnost v map packu" but the subtitle `c.compSub` = "Rank #1 takes the lion's share of clicks in the pack." / "Pozice #1 bere lví podíl kliknutí v balíčku." The third (CompetitorBars) card, line 211, legitimately uses that same `c.compSub`. So the visibility card describes *click share*, not visibility, and the same sentence appears verbatim under two adjacent cards. There is no `visSub` key in `CONTENT` (lines 20–111), so the developer reused `compSub` as a placeholder and it shipped.
- **Root cause**: the `CONTENT` dictionary was authored with a `visTitle`/`visCaption` pair but no `visSub`, so the card wiring borrowed the neighbouring card's subtitle instead of failing to compile.
- **Impact**: user-visibly-wrong marketing copy on a public top-of-funnel page (both cs and en): the visibility card's explanatory line is off-topic and duplicated.
- **Fix sketch**: add a `visSub` string to both `CONTENT.cs` and `CONTENT.en` (e.g. cs "Podíl zobrazení v map packu roste s pozicí." / en "Map-pack impression share climbs with rank.") and change line 204 to `sub={c.visSub}`.

## 2. Rival line's inline `strokeDasharray` defeats both its draw-in and its dashed style

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/marketing/charts/RankClimbChart.tsx:104`
- **Scenario**: The rival `<path>` (lines 94–105) is set up for the shared draw-in trick: `pathLength={1}`, presentation attr `strokeDasharray="1"` (line 102), `className="chart-draw"`. The `.chart-draw` rule (`globals.css:446–448`) is `stroke-dasharray:1; animation:chartDraw` where `@keyframes chartDraw` runs `stroke-dashoffset:1 → 0` — i.e. a single length-1 dash sweeping on over a `pathLength=1` path. But line 104 adds `style={{ animationDelay: "220ms", strokeDasharray: "5 4" }}`. An inline `style` dash-array beats both the presentation attribute *and* the class, so the effective `stroke-dasharray` is `5 4` on a path whose total length is normalised to 1. The first "5"-unit dash more than covers the entire length-1 path, so the line renders as a solid stroke (not the intended dashes), and animating `stroke-dashoffset` 1→0 shifts a 9-unit period by one unit — an imperceptible wiggle, not a draw-in. Result: the rival line neither draws in nor appears dashed.
- **Root cause**: `pathLength={1}` (required for the geometry-free `.chart-draw` sweep) is mutually exclusive with a literal multi-unit `stroke-dasharray`; the author wanted both a visible dash pattern and the draw-in and got neither.
- **Impact**: the signature marketing viz's "rival drifts, drawn slightly after" effect is silently broken on `/lokalni-seo` — the comparison line is static and solid.
- **Fix sketch**: drop the `strokeDasharray: "5 4"` from the inline style (keep only `animationDelay`) so the `.chart-draw` sweep works; if a dashed rival is genuinely wanted, render it *without* `pathLength`/`.chart-draw` and use a real `stroke-dasharray` on the un-normalised path, or fade it in via `animate-fade-in` instead of the draw sweep.

## 3. "Replay" button resets to idle instead of replaying the climb

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/marketing/RankClimbDemo.tsx:119`
- **Scenario**: After one run completes, `running` is false and `hasRun` is true, so the primary button's label becomes `labels.replay` ("Přehrát znovu" / "Replay") at line 147. Its click handler is `run` (line 143). `run()` opens with `if (hasRun) { reset(); return; }` (lines 121–124), so clicking the button labelled *Replay* calls `reset()` — which restores the initial pin order and animates the stats back to 4/12 — and returns without ever re-running the climb. The user must click it a second time (now relabelled "Run") to actually replay. There is also a separate always-visible `Reset` button (lines 149–154), so after a run there are effectively two Reset buttons, one of them mislabelled "Replay".
- **Root cause**: the run/replay state machine treats the post-run click as a toggle-back-to-idle rather than a re-trigger; the label promises a replay the handler doesn't perform.
- **Impact**: user-visibly-broken affordance on the hero of `/lokalni-seo` — the most prominent CTA after the demo runs does the opposite of its label.
- **Fix sketch**: in the `hasRun` branch, re-arm instead of bailing — call `reset()` then immediately re-enter the run body (extract the "start the climb" steps of lines 125–137 into a `start()` helper and call `reset(); start();`), or gate replay on a `requestAnimationFrame` after reset so the layout animation re-plays from the initial slots.

## 4. Crossroad numbering derives from `NAV_ITEMS` order, not the declared journey order

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/brand/crossroad/Crossroad.tsx:48`
- **Scenario**: `BrandLanding` builds the crossroad list as `localizedNavItems(locale).filter((i) => CROSSROAD_HREFS.includes(i.href))` (`BrandLanding.tsx:80–82`), so the items arrive in **`NAV_ITEMS` declaration order** (`nav.ts:21–52`), and `Crossroad` renders and numbers them "01…04" by that array index (`Crossroad.tsx:48`, `String(i + 1).padStart(2, "0")` at line 59). The `CROSSROAD_HREFS` array (`meta.tsx:17`, commented "in journey order") is used only for membership via `.includes` — its *order* is never consulted. Today `NAV_ITEMS` happens to list dashboard→clanek→ai-asistent→kampane in the same order, so the numbers are correct by coincidence. Reordering `NAV_ITEMS` (a plausible independent edit to the header) silently renumbers the homepage crossroad and diverges it from the journey order `CROSSROAD_HREFS`/`CROSSROAD_META` still declare, with no compile-time or runtime signal.
- **Root cause**: two order-bearing sources of truth (`NAV_ITEMS` and `CROSSROAD_HREFS`) exist, but the render pulls order from the one *not* meant to define journey order.
- **Impact**: a future header reorder produces a mis-numbered, out-of-journey-order crossroad on the homepage — a quiet content regression.
- **Fix sketch**: order the list explicitly by `CROSSROAD_HREFS` in `BrandLanding` — e.g. `CROSSROAD_HREFS.map((href) => localized.find((i) => i.href === href)).filter(Boolean)` — so render order tracks the declared journey array rather than nav declaration order.

## 5. Two near-identical onyx "closing CTA" sections duplicated across the two landing pages

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/components/marketing/LocalSeoShowcase.tsx:219`
- **Scenario**: The closing CTA block in `LocalSeoShowcase.tsx:219–235` (`<section className="border-t border-onyx-line bg-onyx">` → `Container` → flex row with an `h2 max-w-xl … text-white` and a `Link href="/dashboard"` brand pill containing `ArrowRight`) is structurally identical to the one in `BrandLanding.tsx:217–233` — same section classes, same flex layout, same pill link to `/dashboard` with the same `ArrowRight` icon. The only differences are `Container py-12` vs `py-14` and the localized heading/label strings. This cross-file pair is not covered by the 2026-07-09 report (which flagged only within-file items: `DEFAULT_LABELS`, `RankClimbChart` path math, `CROSSROAD_META` typing, the inline eyebrow, and dead default props).
- **Root cause**: the LocalSeo page was ported after `BrandLanding` and re-inlined its closing band instead of sharing it.
- **Impact**: two copies of the same onyx CTA to keep visually in sync; a future brand tweak (padding, pill style, icon) must be applied twice or the two landing pages drift.
- **Fix sketch**: extract a small `ClosingCta({ heading, ctaLabel, href = "/dashboard" })` component (co-located under `components/brand/` or `components/marketing/`) rendering the shared onyx section + pill, and have both `BrandLanding` and `LocalSeoShowcase` render it. Verify no third caller before/after via `grep "bg-onyx"` in the two files.
