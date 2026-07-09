# App shell, dev tooling, design system & site metadata infrastructure

> Context #29 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 15

## 1. `template.tsx`'s fade-skip predicate disagrees with `ChromeGate`'s definition of the same route class

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/template.tsx:14-18`
- **Scenario**: `Template`'s own comment says it must "Skip the fade on the data tools (authed `/app` + the public `/dashboard` demo)" and implements that as `const fade = !pathname.startsWith("/app") && pathname !== "/dashboard";`. The sibling component that hides the marketing chrome for the exact same set of routes, `src/components/site/ChromeGate.tsx:12`, defines the set as `pathname === "/app" || pathname.startsWith("/app/") || pathname === "/dashboard" || pathname.startsWith("/dashboard/")` — i.e. it also excludes every subroute of `/dashboard`. `Template`'s check only excludes the exact string `"/dashboard"`, not `/dashboard/*`. A real subroute exists: `src/app/dashboard/report/page.tsx`, reached from the "Datový report" action on the demo dashboard, is rendered inside the same `DemoShell` data-tool surface as `/dashboard`. On that route `ChromeGate` correctly hides the marketing nav/footer, but `Template`'s predicate evaluates `fade = true`, so the 0.4s `animate-fade-in` (which the file's own comment says "reads as lag, not polish" on data tools) plays on every navigation into `/dashboard/report` — the opposite of the documented intent.
- **Root cause**: The "is this route a data-tool surface, not a marketing page" concept is hand-written twice — once as an inclusion list in `ChromeGate` (`startsWith` for both prefixes) and once as an exclusion list in `Template` (`startsWith` for `/app` but only an exact match for `/dashboard`) — with no shared predicate tying them together.
- **Impact**: A provable, live UX regression on a real, reachable route (`/dashboard/report`): the exact "flash of lag" the fade was designed to avoid on data-tool surfaces shows up there today. It is also a landmine for `/app` itself if a future route rename introduces an analogous asymmetry.
- **Fix sketch**: Extract a single `isDataToolPath(pathname: string): boolean` helper (matching `ChromeGate`'s current, more-correct logic) into a small shared module (e.g. `src/lib/nav.ts`, which both `template.tsx` and `ChromeGate.tsx` are already adjacent to), and have both `Template` and `ChromeGate` call it instead of each re-deriving the route set.

## 2. `DevInspector`'s clipboard-copy-with-fallback reimplements a helper that already exists and is already shared

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/_dev-inspector/DevInspector.tsx:28-50`
- **Scenario**: `copyText()` here does: try `navigator.clipboard.writeText`, on failure create a hidden `<textarea>`, `select()`, `document.execCommand("copy")`, remove it, return whether it worked. `src/components/article/permalink.ts:23-42` (`copyTextWithFallback`) already implements the exact same sequence — same textarea styling, same execCommand fallback, same catch-and-swallow — and is deliberately exported as a shared helper per its own docstring ("the heading permalinks and the FAQ question permalinks build the exact same UTM-stamped artifact, so the link format lives here once"). That canonical helper is nevertheless only consumed by 2 of what are now 4 near-identical copies in the repo: `src/components/article/CopyMarkdownButton.tsx:36-52` and `src/components/article/ShareBar.tsx:135-151` both hand-roll the identical fallback again instead of importing it, and this context's own `src/app/design-system/Swatch.tsx:14-22` has a fourth, simplified variant (clipboard-only, no textarea fallback) of the same "copy this string" concern.
- **Root cause**: The clipboard-fallback logic was written inline at each new copy-button call site rather than being pulled from the one place it was already extracted (`permalink.ts`), likely because that file reads as "article" domain code rather than a generic utility, so later authors didn't think to import from it.
- **Impact**: A real cross-cutting browser-compat fix (e.g. a Safari `execCommand` deprecation workaround, or switching to the Clipboard API's `ClipboardItem`) would need to be applied in up to 4 places by hand; today's `Swatch.tsx` variant already silently diverges by dropping the fallback entirely, so keyboard/older-browser users get no copy affordance there at all.
- **Fix sketch**: Move the pure clipboard logic out of `src/components/article/permalink.ts` into a neutral `src/lib/clipboard.ts` (e.g. `copyTextWithFallback`), re-export it from `permalink.ts` for its existing callers (`ShareBar`/heading anchors) to avoid touching those import sites, and update `DevInspector.tsx`'s `copyText` to call it directly instead of reimplementing it (it needs the boolean return value already present in the shared version's shape).

## 3. `error.tsx` hand-rolls the exact locale-fallback logic that `useT` already provides

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/error.tsx:41-42`
- **Scenario**: `RouteError` does `const { locale } = useLocale(); const t = T[locale] ?? T.cs;` and then reads `t.eyebrow`, `t.heading`, etc. directly. `src/lib/i18n/client.ts:22-26` exports `useT<K>(dict: TDict<K>): TFn<K>`, whose body is `const { locale } = useLocale(); const table = dict[locale] ?? dict.cs; return (key, vars) => interpolate(...)` — the identical "pick the active-locale table, fall back to `cs`" rule, packaged as the codebase's own SSOT for exactly this pattern (its docstring: "A translator over a colocated `{cs, en}` table, picking the active locale"). This isn't a one-off in this context: the same manual `dict[locale] ?? dict.cs`-shaped replication (instead of calling `useT`) also appears in `src/components/app/AppSignInGate.tsx`, `src/components/dashboard/WeekdayProfileCard.tsx`, and `src/components/marketing/LocalSeoShowcase.tsx`.
- **Root cause**: `useT` returns a translator *function* (`t("key")`), while `error.tsx` wants direct property access (`t.heading`); rather than adapting to the function form, the fallback logic was copied inline.
- **Impact**: Low today since the two implementations happen to agree, but it means the locale-fallback rule now lives in 5 places instead of 1 — any future change to the rule (e.g. adding a third locale, or logging a telemetry event on fallback) requires updating every hand-rolled copy or silently missing some.
- **Fix sketch**: Replace `const { locale } = useLocale(); const t = T[locale] ?? T.cs;` with `const t = useT(T);` from `@/lib/i18n/client`, and change the four `t.eyebrow`/`t.heading`/`t.body`/`t.digest`/`t.retry`/`t.home` property reads to `t("eyebrow")`/`t("heading")`/etc.

## 4. The "only index the production deploy" rule is encoded twice, independently, in sibling files

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/layout.tsx:38-42`
- **Scenario**: The root metadata's `robots` field gates indexing with `process.env.VERCEL_ENV === "production" ? { index: true, follow: true } : { index: false, follow: false }`. `src/app/robots.ts:23-25` gates the `robots.txt` route with the same literal condition, `robotsPolicy(process.env.VERCEL_ENV === "production")` — and `robots.ts`'s own docstring even says it is "mirroring the env-driven indexing policy already declared as metadata in the root layout (same `VERCEL_ENV === "production"` toggle)", i.e. the duplication was noticed and left in place rather than factored out.
- **Root cause**: `robotsPolicy(isProduction: boolean)` was made a pure, unit-tested function (per `test-unit/robots-policy.test.mjs`), which is good, but the caller-side condition that decides `isProduction` wasn't hoisted alongside it, so `layout.tsx` re-derives the same boolean independently.
- **Impact**: Currently both copies agree, but the SEO risk this code exists to prevent — "the demo ranking for real adtech queries" per `layout.tsx`'s own comment — is precisely the kind of thing that breaks silently if the production-detection rule ever needs to change (e.g. to also cover a custom-domain alias) and only one of the two literal checks gets updated.
- **Fix sketch**: Add `export function isProductionDeploy(): boolean { return process.env.VERCEL_ENV === "production"; }` to `@/lib/site.ts` (already imported by both `layout.tsx` and, transitively via `canonical()`, `robots.ts`), and use it in both `layout.tsx`'s `metadata.robots` ternary and `robots.ts`'s default export instead of the two independent literals.

## 5. `LocEntry.raw` is computed and threaded through every hover chain but never read

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/app/_dev-inspector/devLocate.ts:8-19`
- **Scenario**: `LocEntry` declares `raw: string` ("Raw attribute value: `src/.../File.tsx:88:7`"), `parseLoc` populates it (`return { raw, path, line: Number(lineStr), loc: ... }`, line 47), and it flows through `buildChain`, `dedupeChain`, and every `LocEntry` object passed into `DevInspector.tsx` and `devInspectorUi.tsx`. A repo-wide grep for `.raw` under `src/app/_dev-inspector/` (the only place `LocEntry` is imported) turns up zero reads — `DevInspector.tsx` and `devInspectorUi.tsx` only ever use `.el`, `.path`, `.line`, and `.loc`. No test file imports `devLocate.ts` either.
- **Root cause**: `raw` was likely kept "just in case" while building the `data-loc` parser, then the consumers settled on the derived `.loc`/`.path` fields and never needed the original string back.
- **Impact**: Minimal — a few bytes per hover-chain entry — but it's dead surface area in a file whose whole job is to stay "small and easy to reason about" per its own header comment, and it invites a future reader to wonder what depends on it.
- **Fix sketch**: Remove the `raw` field from the `LocEntry` interface and drop it from the object literal returned by `parseLoc` (`return { path, line: Number(lineStr), loc: ... }`); no other call site changes.
