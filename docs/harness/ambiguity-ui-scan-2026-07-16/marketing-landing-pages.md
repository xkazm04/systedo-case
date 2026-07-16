# Marketing Landing Pages — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Visibility gauge card shows the wrong subtitle (copy-paste of the click-share sub)
- **Severity**: High
- **Lens**: ui
- **Category**: wrong-copy-wiring
- **File**: src/components/marketing/LocalSeoShowcase.tsx:204
- **Scenario**: A visitor scrolls to the three-chart band. The middle card is titled "Viditelnost v map packu" / "Map-pack visibility" but its subtitle reads "Pozice #1 bere lví podíl kliknutí v balíčku" ("Rank #1 takes the lion's share of clicks") — the third card's message, repeated verbatim under both cards 2 and 3.
- **Root cause**: `<ChartCard title={c.visTitle} sub={c.compSub}>` — there is no `visSub` key in `CONTENT`; the competitor-bars sub was reused, almost certainly a paste slip when the card grid was assembled.
- **Impact**: The gauge's story (67% visibility) is explained by a sentence about click share, and the same sentence appears twice on screen. Reads as sloppy on the page whose whole job is polish, in both locales.
- **Fix sketch**: Add `visSub` to both `cs` and `en` CONTENT (e.g. cs: "Jak často se pobočka objeví v mapovém balíčku pro sledovaná hledání.") and pass `sub={c.visSub}` on line 204.

## 2. "Replay" button does not replay — it silently resets, requiring a second click
- **Severity**: High
- **Lens**: ui
- **Category**: misleading-control
- **File**: src/components/marketing/RankClimbDemo.tsx:119-124 (label at 147)
- **Scenario**: A prospect runs the hero demo, then clicks the button now labeled "Přehrát znovu" / "Replay" expecting the pin animation to run again. Instead the canvas snaps back to the initial state (pin at #4, counters animate down) and the button relabels to "Run". Only a second click replays.
- **Root cause**: `run()` short-circuits when `hasRun`: `if (hasRun) { reset(); return; }`. The replay path was implemented as "reset, then let the user click run" instead of reset-then-run.
- **Impact**: The signature interactive moment — the thing the sub copy explicitly invites ("Press the button and watch…") — feels broken on the second use. Counter values visibly animate the *wrong* way (67% → 12%) under a button that promised a replay.
- **Fix sketch**: On the `hasRun` branch, reset synchronously to the initial order/values, then kick off the run on the next frame (`requestAnimationFrame`/`setTimeout(0)` after `setOrder(initialOrder(...))`) so the layout animation replays in one click. Keep the separate Reset button as-is.

## 3. The climb story disagrees with itself: hero says #4 → #1, chart and its sub say #5 → #1
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: inconsistent-numbers
- **File**: src/components/marketing/LocalSeoShowcase.tsx:25,33 (vs. src/components/marketing/charts/RankClimbChart.tsx:10 and RankClimbDemo.tsx:60-66)
- **Scenario**: The hero sub promises "sledujte, jak pin stoupá z #4 na #1" and the interactive demo indeed starts you at slot #4 (avgRank 4). Two scrolls later, the rank chart card says "Váš pin #5 → #1" and plots `YOU = [5, 5, 4, ...]`.
- **Root cause**: The demo and the chart were built with different illustrative starting ranks, and the copy for each was written against its own artifact; nothing ties the two numbers together.
- **Impact**: On a page selling measurement precision, the same "your location" starts at two different ranks depending on which module you look at — an attentive prospect (or the client in a case-study review) reads it as fabricated numbers, which undercuts the deliberate "illustrative but consistent" framing used elsewhere.
- **Fix sketch**: Pick one starting rank and propagate: either seed `RankClimbChart.YOU` with 4 (`[4, 4, 3, ...]`) and update `rankSub` to "#4 → #1", or change the demo's initial slot and hero copy to #5. A shared constant (e.g. `START_RANK`) exported next to the chart data would keep them from drifting again.

## 4. Crossroad ordering claim is false and missing meta silently drops a destination
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: silent-fallback
- **File**: src/components/brand/BrandLanding.tsx:76-82; src/components/brand/crossroad/Crossroad.tsx:51-52
- **Scenario**: BrandLanding's comment (and meta.tsx's "in journey order" doc) promise the crossroad renders the four stops in `CROSSROAD_HREFS` order, but the code only *filters* `localizedNavItems(locale)` — the rendered order is whatever the nav model uses. Separately, if a fifth href is added to `CROSSROAD_HREFS` without a `CROSSROAD_META` entry (or a nav href is renamed), `if (!meta) return null` drops the card with no warning while the `01/02/…` indices stay derived from the pre-drop array position.
- **Root cause**: Two data sources (nav model + meta map) joined by href with no ordering step and a silent-null fallback for join misses.
- **Impact**: Journey-order intent can silently invert if nav order changes, and a rename/addition mismatch removes a homepage destination without any build- or runtime-signal — exactly the "future developer will struggle" trap the comments try to paper over.
- **Fix sketch**: Order explicitly: map over `CROSSROAD_HREFS` and look each up in the nav items (making order single-sourced), and in dev `console.warn` (or throw in a unit test asserting `CROSSROAD_HREFS ⊆ nav hrefs ∩ CROSSROAD_META keys`) instead of silently returning null.

## 5. CompetitorBars hardcodes MAX=40 while exposing a `data` prop — off-scale values overflow the plot
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: magic-number
- **File**: src/components/marketing/charts/CompetitorBars.tsx:20 (used at 36)
- **Scenario**: The component invites reuse (`data` is a public prop with a default), but bar width is `(d.value / MAX) * plotW` with `MAX = 40` fixed. Any caller passing a share above 40% (entirely plausible for "lion's share" click data, e.g. rank #1 at ~55%) draws a bar past the plot edge and pushes the value label out of the 44px right padding, clipping it.
- **Root cause**: The scale ceiling was tuned to the illustrative default dataset (max 34) and left as an unexplained constant; nothing clamps or derives it from the data.
- **Impact**: First real reuse with non-default data silently produces a broken chart; the constant also mildly misleads readers of the default render (bars are scaled to 40, not 100, so 34% looks near-full — a visual exaggeration nobody documented).
- **Fix sketch**: Derive the scale: `const max = Math.max(...data.map(d => d.value)) * 1.15` (or accept an optional `max` prop defaulting to that), and add a one-line comment noting bars are scaled to the local max, not to 100%.
