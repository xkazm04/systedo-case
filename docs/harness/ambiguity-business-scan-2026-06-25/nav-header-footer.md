# Header & Footer Navigation — Ambiguity + Business scan
> Context: Site-wide header + footer + a docs-style prev/next task pager, all driven by one typed nav model (`NAV_ITEMS`), plus a DOM-driven theme toggle.
> Files analyzed: 5
> Total findings: 5

## 1. End-of-journey "conversion moment" loops back to the overview instead of letting a reviewer contact/hire the author
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: S
- **File**: src/components/site/TaskPager.tsx:78-100 (and src/components/site/Footer.tsx:62-88)
- **Problem/Opportunity**: The `ClosingCta` comment explicitly calls this card "the highest-leverage conversion moment of a hiring-pitch case study" (lines 75-77), yet its only action is `href="/"` — back to the overview the reviewer already saw. The footer bottom bar links to pricing/social/library/map/design but offers no contact, email, LinkedIn, or CV link anywhere in the chrome.
- **Why it matters**: This is a portfolio whose stated purpose is to land the author work; the moment a reviewer is most engaged (just finished everything) dead-ends into a loop with no way to reach the person.
- **Fix sketch**: Repoint `ClosingCta` (or add a second card) to a real conversion target — `mailto:`, a `/kontakt` page, or an external CV/LinkedIn URL — and add a "Kontakt" link to the footer bottom bar in Footer.tsx. Keep the cs-CZ copy and `„…"` quoting rule. Not gate-triggering.

## 2. The premium `/app` surface is invisible to anonymous visitors — no "try it" acquisition CTA
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: src/components/site/Nav.tsx:66-74 (mobile mirror at 94-103)
- **Problem/Opportunity**: The `/app` link is wrapped in `{authed && (…)}`, so the logged-in workspace (Creative Studio / analytics, etc.) only appears after you are already authenticated. Anonymous visitors — i.e. every first-time reviewer — get no entry point or even awareness that a deeper product exists.
- **Why it matters**: Discovery of the most impressive built feature is gated behind a login the visitor has no reason to perform yet; acquisition funnels normally surface the product to drive the sign-in, not the reverse.
- **Fix sketch**: For `status !== "authenticated"`, render a low-key "Vyzkoušet aplikaci" / sign-in CTA pointing at the auth flow (reuse `AuthButton` styling) so anonymous users get one click toward the product. Not gate-triggering.

## 3. `navLabel` reads raw `NAV_ITEMS`, so breadcrumbs show Czech labels in non-cs locales — contradicting its own comment
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/nav.ts:66-70 (vs `localizedNavItems` at 57-64)
- **Problem/Opportunity**: `navLabel` resolves labels from the source `NAV_ITEMS` array, which is always Czech, while the header and footer render through `localizedNavItems(locale)`. The comment claims breadcrumbs "reuse the same wording as the header/footer instead of hard-coding strings that can drift" — but in `en` the breadcrumb crumb stays Czech while the header above it is English, which is exactly the drift it set out to prevent.
- **Why it matters**: A visible, silent localization mismatch on every breadcrumbed page in the English locale, hidden behind a comment that asserts the opposite.
- **Fix sketch**: Make `navLabel` locale-aware — accept a `locale` arg (or call `localizedNavItems`) and match `href` against the localized list, falling back to `NAV_ITEMS`. Update the comment to state the locale dependency. Not gate-triggering.

## 4. `sitemapEntries` hard-codes the meta pages that the footer links independently — two sources of truth, drift risk
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/nav.ts:74-76 (vs Footer.tsx:66-83)
- **Problem/Opportunity**: The file header (lines 1-2) and the `sitemapEntries` comment (72-73) sell `nav.ts` as the "single source of truth" where "adding a page is a single edit away from the sitemap." But the meta pages `/cena`, `/socialni`, `/knihovna`, `/mapa`, `/design-system` are listed once here and again, by hand, in the footer's bottom bar — and `/clanek/vykon` lives only in the sitemap list. Adding/removing a meta page requires editing two places that have no shared list.
- **Why it matters**: A page can silently exist in the sitemap but be unreachable from the footer (or vice-versa), and the documented "single source of truth" guarantee is false for everything outside `NAV_ITEMS`.
- **Fix sketch**: Introduce an exported `META_PAGES` array (href + label key) in nav.ts; derive both `sitemapEntries()` and the footer bottom-bar links from it. Decide and comment whether `/clanek/vykon` belongs in the footer. Not gate-triggering.

## 5. `TaskPager` keeps its own inline cs/en dictionary instead of the app's message system — and silently supports only two locales
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: M
- **File**: src/components/site/TaskPager.tsx:16-39 (consumed via `getT(T)` at line 45)
- **Problem/Opportunity**: Every other surface here localizes through `getMessages(locale)` / `localizedNavItems`, and `localizedNavItems` accepts any `SupportedLocale`. The pager instead embeds a hand-rolled `T` object hard-coded to `cs`/`en` only. If a third `SupportedLocale` is ever added, the nav labels/blurbs localize correctly but the pager chrome ("Další", "Pokračujte…", closing copy) falls back to whatever `getT` does for an unlisted key — an undocumented, untested edge.
- **Why it matters**: Two divergent i18n patterns in one small context create a maintenance trap: translators won't know the pager strings live in the component, and locale coverage is inconsistent and unenforced.
- **Fix sketch**: Move the `T` entries into the shared message dictionary under a `taskPager` namespace and resolve them like the rest of the app, or document at the `T` declaration that the pager is intentionally cs/en-only and assert that contract in a test. Not gate-triggering.
