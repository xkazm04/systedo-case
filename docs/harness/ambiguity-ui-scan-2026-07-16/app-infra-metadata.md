# App shell, dev tooling, design system & site metadata infrastructure — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 3 medium / 1 low)

## 1. Share/install metadata speaks three different languages for one brand surface
- **Severity**: High
- **Lens**: ambiguity
- **Category**: mixed-language-metadata
- **File**: src/app/layout.tsx:23 (also src/lib/site.ts:29, src/app/opengraph-image.tsx:10, src/app/manifest.ts:15)
- **Scenario**: A visitor shares the site on LinkedIn/Slack. The OG title and `SITE_DESCRIPTION` are English ("Adamant is the AI workspace for advertising…"), the OG image itself renders Czech copy ("Tři úkoly, jeden klient, produkční řemeslo") with a Czech `alt`, `<html lang="cs">` is the SSR default, and the manifest declares `lang: "cs"` around that same English description. The preview card shows English text over a Czech image on a Czech-first site.
- **Root cause**: No documented decision about the metadata language. `SITE_DESCRIPTION` (English) is reused by layout metadata and manifest, while opengraph-image.tsx and the rest of the site are Czech-first with an `en` cookie upgrade; nothing states which language the static share surface should use, so each file guessed differently.
- **Impact**: Incoherent first impression on exactly the highest-leverage surface (social shares of a portfolio piece); the manifest also asserts `lang: "cs"` for an English string, which is wrong hint data for assistive tech and stores.
- **Fix sketch**: Decide once in lib/site.ts — e.g. export `SITE_DESCRIPTION_CS`/`_EN` with a comment naming the chosen share-card language — then align layout `openGraph`, opengraph-image copy/alt, and manifest `lang`/description to that single decision.

## 2. error.tsx and not-found.tsx hand-roll CTA buttons the design system already extracted into `Button`
- **Severity**: Medium
- **Lens**: ui
- **Category**: component-reuse
- **File**: src/app/error.tsx:64-76 (also src/app/not-found.tsx:46-53)
- **Scenario**: The design-system page proudly documents `Button` as "extrahovaný z ~185 ručně psaných tlačítek" — yet the two most prominent recovery screens still hand-write `rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.99]` (primary) and a bordered secondary, byte-for-byte duplicated across both files. A future `Button` restyle (focus ring, padding, dark-mode) silently skips the error and 404 pages.
- **Root cause**: The error/404 pages predate (or dodged) the Button extraction; nothing marks them as intentional exceptions, and `Button` already supports `href` rendering per the DS page, so there is no technical blocker.
- **Impact**: Guaranteed visual drift on the pages users see when something already went wrong — the worst moment to look inconsistent; also the extraction claim on /design-system is quietly false.
- **Fix sketch**: Replace both hand-rolled pairs with `<Button onClick={reset}>` / `<Button href="/" variant="secondary">` (global-error.tsx is a legitimate exception and documents why).

## 3. Template's fade denylist uses fragile path matching with an undocumented asymmetry
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: route-prefix-matching
- **File**: src/app/template.tsx:17
- **Scenario**: `!pathname.startsWith("/app")` also disables the fade for any future marketing route beginning with "app" (`/approach`, `/appka`), while `pathname !== "/dashboard"` is an exact match, so a future `/dashboard/settings` sub-route would fade again — two different matching semantics on one line, and the doc comment (lines 15-17 duplicate lines 13-14 almost verbatim) explains the *why* but not the *matching rule*.
- **Root cause**: Prefix vs exact match chosen ad hoc per route; the denylist lives only here rather than deriving from the nav/route model, and the duplicated comment suggests a half-finished edit.
- **Impact**: Silent wrong behavior the day a colliding route ships (fade appearing inside a data tool = perceived lag, or a marketing page losing its polish), plus reader confusion from the doubled comment.
- **Fix sketch**: Match on path segments (`pathname === "/app" || pathname.startsWith("/app/")`, same shape for `/dashboard`), collapse the two comments into one, and note explicitly that sub-routes of both are covered.

## 4. Swatch hand-rolls clipboard copy and swallows failure silently — the shared helper exists for exactly this
- **Severity**: Medium
- **Lens**: ui
- **Category**: clipboard-feedback
- **File**: src/app/design-system/Swatch.tsx:14-22
- **Scenario**: On an insecure context or denied permission, clicking a swatch does nothing at all — no "Zkopírováno", no error, no fallback attempt. Meanwhile DevInspector in the same context group uses `copyTextWithFallback` (whose doc comment explicitly says it replaced components that "previously hand-rolled this exact sequence") and shows an explicit "Copy failed" state.
- **Root cause**: Swatch calls `navigator.clipboard.writeText` directly with an empty `catch`, bypassing `src/lib/clipboard.ts` which provides the execCommand fallback and a success boolean.
- **Impact**: A dead-feeling click on the living style guide (its stated purpose is being "a working DS reference, not just a display"); inconsistent copy UX between two tools in the same platform layer.
- **Fix sketch**: `const ok = await copyTextWithFallback(token.cssVar)` and render a failure hint (e.g. reuse the label slot for "Kopírování selhalo") when `ok` is false, mirroring DevInspector's pattern.

## 5. Garbled sentence and unexplained priority constants in sitemap.ts
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: broken-comment-magic-numbers
- **File**: src/app/sitemap.ts:8-15
- **Scenario**: A developer reading "the recrawl hint `meta.dateModifiedISO` was added to power (the nav-derived entries have no meaningful modification date…" hits a sentence that breaks mid-clause — the text before the parenthesis is missing its object. Below it, `priority: path === "/" ? 1 : 0.7` and `changeFrequency: "monthly"` carry no rationale, and the `/clanek` literal duplicates a route string owned by the nav model.
- **Root cause**: An edit truncated the doc comment, and the priority/frequency values were picked without recording why (0.7 vs 0.5, monthly vs weekly).
- **Impact**: Low — search engines largely ignore priority — but the file's only comment actively confuses, and the hardcoded `/clanek` will silently stop matching if the article route is ever renamed in the nav SSOT.
- **Fix sketch**: Repair the sentence ("…the recrawl hint that `meta.dateModifiedISO` was added to power"), one line noting the priority values are conventional defaults, and import the article path constant from the nav/article module instead of the string literal.
