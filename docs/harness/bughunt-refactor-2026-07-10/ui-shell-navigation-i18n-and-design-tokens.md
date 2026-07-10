# UI Shell: Navigation, i18n & Design Tokens

> Total: 5
> Critical: 0 · High: 0 · Medium: 2 · Low: 3
> Lenses: bug-hunter 3 · code-refactor 2 (new-only, deduped vs code-refactor-2026-07-09)

## 1. A protocol-less `NEXT_PUBLIC_SITE_URL` makes `new URL(SITE_URL)` throw and 500s the entire site

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/site.ts:7`
- **Scenario**: An operator sets `NEXT_PUBLIC_SITE_URL=systedo-case.vercel.app` or `www.adamant.app` (bare host, no scheme — an extremely common env-config mistake, since the value "looks like a URL"). `SITE_URL` is then a scheme-less string. `src/app/layout.tsx:20` does `metadataBase: new URL(SITE_URL)` at metadata-eval time, and `canonical()` (`site.ts:15`) does `new URL(path, SITE_URL)`. `new URL("systedo-case.vercel.app")` throws `TypeError: Invalid URL` — it is not a valid absolute URL without a scheme.
- **Root cause**: The code assumes any provided `NEXT_PUBLIC_SITE_URL` is a fully-qualified absolute URL; the internal fallback branch is correctly `https://…`-prefixed, but the externally-supplied value is passed straight into `new URL()` with no scheme validation/normalization.
- **Impact**: Site-wide crash. `metadataBase` is evaluated for the root layout, so *every* route's metadata generation throws → blanket 500. `canonical()` is also consumed by `robots.ts`, `sitemap.ts`, the article JSON-LD and the cron report link, so SEO surfaces and the emailed `/report/{token}` link break too. No compile-time signal — it only fails at runtime, after deploy.
- **Fix sketch**: Normalize once at definition: if the resolved value lacks `^https?://`, prepend `https://` before exporting `SITE_URL`; optionally wrap the final assignment in a `try { new URL(x) } catch { fallback }` guard so a malformed value degrades to the known-good default instead of taking the whole site down.

## 2. Missing/renamed `en` nav key silently serves Czech labels to English users — the `Record<string, NavCopy>` type bypasses the "missing key is a type error" guarantee

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/i18n/messages.ts:43`
- **Scenario**: `messages.ts`'s header comment promises "`en` must stay structurally identical (a missing key is a type error)" — true for every field *except* `nav.items`, which is typed `items: Record<string, NavCopy>` (an open string-keyed map), not a key-exhaustive record of the real hrefs. `localizedNavItems(locale)` (`nav.ts:57-64`) does `const copy = items[item.href]; return copy ? {…} : item;` — so if someone adds a NAV_ITEMS entry (or renames an href like `/clanek` → `/clanek-novy`) and forgets to update `en.nav.items`, `items[item.href]` is `undefined` and the code silently returns the **Czech** source `item`.
- **Root cause**: `nav.items` is keyed by a loose `Record<string, …>` instead of being tied to the actual set of `NAV_ITEMS` hrefs, so TypeScript cannot catch a missing/renamed translation the way it does for the rest of `Messages`.
- **Impact**: English users see a mixed-language navigation (some items in English, the untranslated one in Czech) across the header (`Nav.tsx`), 404 page, sitemap page, brand landing and command palette — all consumers of `localizedNavItems` — with zero build/test warning. Exactly the "shows Czech to an English buyer" drift the i18n layer exists to prevent.
- **Fix sketch**: Type it as `items: Record<(typeof NAV_ITEMS)[number]["href"], NavCopy>` (or derive a `NavHref` union from `NAV_ITEMS` and use `Record<NavHref, NavCopy>`), so an added/renamed href becomes a compile error in `en` until translated. Note the import direction (`nav.ts` imports `messages.ts`) — put the href union in a shared const to avoid a cycle.

## 3. `design-tokens.ts` reads `globals.css` from `process.cwd()` at module scope — 500s `/design-system` in serverless prod, despite the "at build time" comment

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/design-tokens.ts:38-39`
- **Scenario**: `readTheme()` does `readFileSync(join(process.cwd(), "src", "app", "globals.css"), …)`, and it runs at module load (`const COLOR_TOKENS = parseDeclarations("color")` at line 67, plus `colorRamps`/`fontTokens`/etc.). The path is built dynamically from `process.cwd()`, so Next.js's file-tracing cannot statically detect and bundle `src/app/globals.css` into the serverless function. On Vercel, `process.cwd()` at runtime does not contain the original `src/` source tree → `readFileSync` throws `ENOENT`.
- **Root cause**: The module's own comment claims the parse happens "at build time," but module-scope evaluation of a server component's dependency actually executes at *runtime* (first import in the serverless function), reading a source file that is not part of the deployed function bundle.
- **Impact**: The `/design-system` showcase page throws a 500 in production (works fine locally because the source tree is present). It's an internal/showcase surface, so blast radius is limited, but the page is listed in `FOOTER_META_PAGES` and the sitemap, so it's publicly linked and crawlable.
- **Fix sketch**: Read the tokens at true build time — e.g. generate a JSON token manifest in a build step and import it, or inline the `@theme` values — rather than `readFileSync` on a `process.cwd()`-relative path at request time. At minimum wrap `readTheme()` in a try/catch returning `""` so the page degrades to an empty swatch list instead of a 500.

## 4. Czech nav copy is duplicated in `NAV_ITEMS` and `messages.cs.nav.items`, but the `messages` copy is never read at runtime

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/i18n/messages.ts:87-105`
- **Scenario**: `messages.cs.nav.items` holds the exact same `label`/`blurb` strings as `NAV_ITEMS` in `nav.ts:21-52` (e.g. `/dashboard` → "Dashboard" / "Výkonnostní přehled klienta…" appears verbatim in both). But `localizedNavItems(locale)` short-circuits with `if (locale === "cs") return NAV_ITEMS;` (`nav.ts:58`) and only ever reads `getMessages(locale).nav.items` on the **non-cs** path. A repo grep confirms no other reader of `nav.items` — so `messages.cs.nav.items` is dead data at runtime, present only to satisfy the `Messages` shape. This is a distinct duplication from the prior report's `SUPPORT_EMAIL` and `useT/getT` findings.
- **Root cause**: The `cs` dictionary is declared as the structural "source of truth" for the `Messages` type, forcing it to carry an `items` copy even though the cs render path deliberately bypasses it in favour of `NAV_ITEMS`.
- **Impact**: Silent-drift trap: an editor who updates a Czech label in `messages.cs.nav.items` sees no effect (cs nav reads `NAV_ITEMS`), and an editor who updates only `NAV_ITEMS` leaves two Czech copies disagreeing — with no test guarding the pair. Also inflates the dictionary a maintainer must keep in lockstep.
- **Fix sketch**: Make `localizedNavItems` read from `messages.<locale>.nav.items` for **all** locales (including cs, overlaying onto `NAV_ITEMS` for href/task/blurb), so there is one Czech source; or drop `label`/`blurb` from `nav.items` entirely and keep `NAV_ITEMS` as the sole label store, having the non-cs path overlay from a leaner translation map. Either way, delete the redundant cs copy.

## 5. `navLabel`'s `locale === "cs" ? NAV_ITEMS : localizedNavItems(locale)` re-implements a branch `localizedNavItems` already contains

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: cleanup
- **File**: `src/lib/nav.ts:71`
- **Scenario**: `navLabel` computes `const items = locale === "cs" ? NAV_ITEMS : localizedNavItems(locale);`. But `localizedNavItems` (`nav.ts:57-58`) already begins with `if (locale === "cs") return NAV_ITEMS;` — so `localizedNavItems(locale)` alone yields the identical result for every locale, including cs. The ternary duplicates the exact cs-short-circuit logic that lives one function above it.
- **Root cause**: The cs special-case was inlined at the `navLabel` call site rather than delegated to the helper that already owns that rule, so the "cs → raw NAV_ITEMS" decision now exists in two places.
- **Impact**: Minor, but if the cs resolution rule ever changes (e.g. cs also starts overlaying), it must be edited in both spots or `navLabel` silently diverges from `localizedNavItems`. Not present in the prior report.
- **Fix sketch**: Replace the ternary with `const items = localizedNavItems(locale);` and delete the now-unused cs branch. Behaviour is identical for cs and non-cs; verify against the `navLabel` breadcrumb call sites in `clanek/page.tsx` and `clanek/vykon/page.tsx`.
