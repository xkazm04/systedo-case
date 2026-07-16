# UI Shell: Navigation, i18n & Design Tokens — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 3 medium / 1 low)

## 1. Swatch ink picker is theme-blind — illegible token labels in dark mode
- **Severity**: High
- **Lens**: ui
- **Category**: dark-mode-contrast
- **File**: src/lib/design-tokens-color.ts:31 (with src/lib/design-tokens.ts:6-9 and src/app/globals.css:172-227)
- **Scenario**: A reviewer opens /design-system with the dark theme active. `readableInkOn(hex)` decides ink from the **light-mode hex parsed out of `@theme`**, while the swatch itself renders with the **live** `var(--color-…)` — and dark mode redefines several of those tokens (`--color-ink` flips `#0d1a24` → `#e7eef5`). For any light swatch (luminance > 0.45) the function returns `var(--color-ink)`, which in dark mode is near-white ink on a light swatch. Conversely, tokens whose live value flips dark (e.g. `canvas`/`surface`) keep an ink chosen for their light value.
- **Root cause**: Two sources of truth for the same pixel — ink is computed from the static light-theme value, background is painted from the theme-dependent variable, and the "dark" branch of the decision resolves to a variable that itself changes meaning per theme.
- **Impact**: Design-system page (the project's showcase surface) ships unreadable white-on-white / dark-on-dark labels in dark mode — exactly the WCAG-contrast failure this helper exists to prevent.
- **Fix sketch**: Return literal, theme-independent inks (`"#0d1a24"` / `"#ffffff"`) instead of `var(--color-ink)`, and paint swatches from the parsed hex (already shown as the label) rather than the live var — or read dark-theme overrides too and pick ink per theme via a CSS pair (`light-dark()` or two custom props).

## 2. Czech nav copy is defined twice — the drift the file promises to prevent
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: duplicated-source-of-truth
- **File**: src/lib/nav.ts:21-52 (duplicated at src/lib/i18n/messages.ts:87-105)
- **Scenario**: A developer rewords the /kampane blurb in `NAV_ITEMS` (nav.ts opens with "Single source of truth … so links never drift"). The identical Czech strings in `messages.ts cs.nav.items` stay stale. Nothing renders them today — `localizedNavItems` short-circuits `locale === "cs"` to `NAV_ITEMS` — so no test, type, or page catches the divergence until someone reads `getMessages("cs").nav.items` directly and gets old copy.
- **Root cause**: The `Messages` shape requires `cs` to mirror `en` structurally, so the cs nav strings were hand-copied into the dictionary instead of derived from `NAV_ITEMS`.
- **Impact**: Silent bilingual drift: cs and en blurbs already describe /kampane storage differently ("SQLite" vs "Firestore" — one of them is wrong right now, and site.ts:38 says campaigns live in Firestore). Future edits will widen the gap.
- **Fix sketch**: Build `cs.nav.items` programmatically from `NAV_ITEMS` (`Object.fromEntries(NAV_ITEMS.map(i => [i.href, { label: i.label, blurb: i.blurb }]))`), or add a unit test asserting `MESSAGES.cs.nav.items` equals the `NAV_ITEMS` projection; reconcile the SQLite/Firestore blurb while at it.

## 3. Diacritics-stripping regex is written with invisible combining characters
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: invisible-source-characters
- **File**: src/lib/nav.ts:99
- **Scenario**: `normalizeForSearch` strips accents with `/[̀-ͯ]/g` — a character class whose bounds are the raw combining marks U+0300 and U+036F, which render as smudges attached to the brackets. A future editor reformatting the file, a copy-paste through a chat tool, or a linter "fixing" the line can corrupt or delete the range with no visible diff cue; reviewers cannot verify what the class matches by reading it.
- **Root cause**: Literal Unicode combining characters used instead of escape sequences in a regex that exists precisely because of non-ASCII subtleties.
- **Impact**: If silently mangled, `slugify` and the Cmd/Ctrl+K palette lose diacritics-insensitivity ("clanek" stops finding "Článek", article slugs change → broken URLs), and the breakage is invisible in code review.
- **Fix sketch**: Write it as `/[̀-ͯ]/g` (identical behavior, visible intent); the existing tests keep guarding semantics.

## 4. site.ts strings bypass the i18n layer — mixed-language footer and metadata
- **Severity**: Medium
- **Lens**: ui
- **Category**: i18n-gap
- **File**: src/lib/site.ts:29-41
- **Scenario**: The app is bilingual end-to-end (typed cs/en dictionaries, cookie-synced server/client locale), yet `SITE_DESCRIPTION` is English-only and `STACK_FACTS` is Czech-only ("Data: JSON (obsah)…", "Nasaditelné na Vercel"). An en-locale visitor sees a Czech "O projektu" footer column under an English "About" heading; the cs-default site ships an English meta description to Czech search snippets.
- **Root cause**: These constants predate (or sidestep) the messages dictionary; nothing marks them as deliberately single-language, so each new consumer inherits the inconsistency.
- **Impact**: Visible language mixing on every page footer for en users and off-locale SEO copy for the primary cs audience — precisely the "two company voices" the file's own E1 comment warns against.
- **Fix sketch**: Move `SITE_DESCRIPTION` and the translatable parts of `STACK_FACTS` into `Messages` (footer.about facts + a per-locale description used by generateMetadata via `getServerLocale()`); keep model IDs interpolated so the no-drift guarantee survives.

## 5. Supported-locale set is re-encoded in three places; navLabel defaults to cs
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: hidden-coupling
- **File**: src/lib/i18n/locale.ts:8-10 (also src/lib/i18n/interpolate.ts:16-19, src/lib/nav.ts:70)
- **Scenario**: A third locale is added to `SupportedLocale` in format.ts. `isLocale` (hardcoded `"cs" || "en"`) still compiles and silently rejects the new cookie → server renders cs; `TDict` (hardcoded `{cs, en}`) needs a shape change in every colocated table; and any `navLabel` call site that omits the optional `locale` param (defaults `"cs"`) keeps returning Czech labels with no error. Today's two call sites do pass the locale, but the default makes the next omission invisible.
- **Root cause**: The locale universe lives as a union type only, so runtime guards and dictionary shapes each restate it by hand; the `navLabel` default trades an explicit argument for a silent fallback.
- **Impact**: Locale expansion degrades quietly (new-locale users pinned to Czech) instead of failing loudly; wrong-language breadcrumbs are one forgotten argument away.
- **Fix sketch**: Export `SUPPORTED_LOCALES = ["cs", "en"] as const` from format.ts, derive both `SupportedLocale` and `isLocale` from it (`.includes`), type `TDict` as `Record<SupportedLocale, Record<K, string>>` with cs required, and make `navLabel`'s locale parameter required.
