# i18n contract — systedo-case (this repo)

The repo-specific half of the `/i18n-translate` skill (Phase 0 artifact),
verified against code. If a run proves a line stale, fix it here in the same
change.

## THE INVERSION — read this first

**`cs` is the source of truth, `en` is the derived locale.** This is a
Czech-first case-study app (`DEFAULT_LOCALE: "cs"` in `src/lib/format.ts`);
the `Messages` type is derived from the cs shape and every colocated table
falls back to cs. Everything the skill says about "the source locale" applies
to **Czech** here: don't rewrite existing cs copy to make an en translation
easier; a `review en` wave audits the *translations*, and "leftover-source"
means leftover Czech in the en column. Conversely, a surface hardcoded in
English is a **cs coverage gap** (it renders English to Czech users).

## Artifacts in this repo

| File | Holds |
| --- | --- |
| `glossary.md` | termbase — what to call things |
| `style-cs.md` · `style-en.md` | voice per locale |
| `exemplars-en.md` | gold cs→en pairs |
| `constructions-en.md` | **the anchor set for translationese** — how to build the sentence. BOOTSTRAP, unvalidated against this catalog; the first `review en` run must replace every invented example with a real one and delete any rule this catalog does not violate. |
| `lessons-i18n.md` | field notes from a full-catalog sweep on a sibling product — read before a large run |

Because `en` is the derived locale here, the constructions file is
`constructions-en.md` and its authority is the **Microsoft Writing Style
Guide**, not a per-language localization guide. Note that most published
localization advice assumes an English *source*; half of it is backwards for
this repo.

## Catalog layout — colocated, not central

- **Central dictionary** (`src/lib/i18n/messages.ts`): only `nav` / `footer` /
  `switcher` — chrome shared across pages. `const cs: Messages` defines the
  shape; `en` must match structurally (a missing key is a **type error** — the
  TS compiler is the parity gate; there is no parity script).
- **Everything else is colocated**: each component owns a
  `const T = { cs: {...}, en: {...} }` table typed `TDict<K>`
  (`src/lib/i18n/interpolate.ts`), consumed via `useT(T)` in client components
  and `await getT(T)` in server components. `TDict` is
  `Record<SupportedLocale, Record<K, string>>`, so **adding a locale or a key
  to one column and not the other fails `typecheck`** — that is the whole
  enforcement story.
- Locales: `SUPPORTED_LOCALES = ["cs", "en"]` (`src/lib/format.ts`). Locale is
  a cookie (`LOCALE_COOKIE = "locale"`), read by `src/lib/i18n/locale.ts`
  (server) and `LocaleProvider` (client).

## Format system — bare regex interpolation, NOT ICU

`interpolate()` in `src/lib/i18n/interpolate.ts`:

```ts
template.replace(/\{(\w+)\}/g, (m, key) => key in vars ? String(vars[key]) : m)
```

- `\w` is ASCII-only and lookup is case-sensitive → **placeholder names are
  frozen, byte-identical in both locales.** No `{n, plural, …}` syntax exists;
  it would render raw.
- **No plural mechanism at all.** Czech number agreement can't be expressed in
  one key. Where a count is interpolated, prefer count-invariant phrasing
  (verbal noun / the number after an invariant noun); if a surface genuinely
  needs 1/2–4/5+ forms, use separate keys the call site picks — and flag it.

## Numbers / dates / currency

`createFormatters(locale)` in `src/lib/format.ts` (client: `useFormatters()`,
server: `getServerFormatters()`) — cs → cs-CZ/CZK, en → en-US/USD. **Never
hardcode a formatted number/price/date into a string**; keep it a placeholder
and let the formatters produce it.

## Coverage model (what "full coverage" means here)

A surface is covered when every user-facing string it renders flows through
`useT`/`getT`/`getMessages`. Coverage work = externalizing hardcoded JSX
strings into a colocated `T` table:

- Hardcoded **Czech** string → becomes the `cs` value **verbatim** (source
  copy; mechanical typography fixes only — `…` for `...`, correct quotes
  `„…"`), plus a **written** `en` value.
- Hardcoded **English** UI string → becomes the `en` value; **write** the `cs`
  per the skill's Pass A (this is the actual cs-coverage debt).
- Not user-facing (never externalize): `src/data/**` fixtures, API-route
  internals, console/log/error plumbing, LLM prompts (`src/lib/llm`,
  `src/lib/ai-types.ts`), SEO slugs/route names (`/clanek`, `/kampane` are
  URLs), design-token names, test files.
- `aria-label`s, `title`s, `alt`s and empty states **are** user-facing.
- Page `generateMetadata` titles/descriptions: localize only if the file
  already has a server locale read; otherwise flag, don't improvise.

## Gates — run before finishing

| Gate | What it catches |
|---|---|
| `npm run typecheck` | cs/en structural parity (TDict), unknown keys — the parity gate |
| `npm run lint` | unused imports left by externalization |
| `npm run build` | server/client boundary mistakes (`useT` in a server component, `getT` in a client one) |

There is no untranslated-values scan; fallback is `dict[locale] ?? dict.cs`,
so an en gap silently renders Czech. After a coverage wave, grep new `T`
tables for en values that equal their cs value (minus true cognates).

## Do-not-translate seeds

Adamant (client brand), mionelo.cz, Systedo, product/tool names (Google Ads,
Sklik, Gemini, Firestore, SQLite, GA4), marketing metrics kept as-is in Czech
HR/marketing speech: PNO, CAC, LTV, PPC, SEO, CTR, ROAS, RSA, CPC, UX.
"Case study" stays English in cs (established usage in the app).

## Call-site lookup

Colocated by construction — the `T` table sits in the same file as its usage;
grep `useT(` / `getT(` / `getMessages` to find adopters.

## Operational notes

- 297 tsx files under `src/app` + `src/components`; ~165 adopters at the time
  of writing. Batch coverage work **by file** (the tables are per-file — this
  parallelizes cleanly with zero merge conflicts if agents own disjoint files).
- Client vs server: `"use client"` at the top → `useT`; otherwise async server
  component → `await getT(T)`. Mixed files: hooks only in the client parts.
- Keep `T` tables `as const`-free and typed by inference against `TDict<K>` —
  copy the shape of an existing adopter (e.g. `LtvModule.tsx`).
