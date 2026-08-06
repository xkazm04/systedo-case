# i18n contract — systedo-case (this repo)

The repo-specific half of the `/i18n-translate` skill (Phase 0 artifact),
verified against code. If a run proves a line stale, fix it here in the same
change.

## THE DIRECTION — read this first

**`en` is the authoring source of truth. `cs` is transcreated from it.**

This reversed on **2026-08-05**. The app was built Czech-first and the catalog
was authored in Czech, with English derived from it; that produced Czech that
was native by construction but English that had to be back-filled, and — the
reason for the flip — a Czech column written without any of the skill's
supporting artifacts, whose quality the owner judged weak.

The direction now is:

1. **`en` is written from the functionality**, not from another string. To
   author or re-author an `en` value you read the call site — what the control
   does, who is looking at it, how much room it has — and write the English a
   product copywriter on this team would ship. `en` is the column that answers
   "what does this actually say".
2. **`cs` is transcreated from the finished `en`**, through
   [`glossary.md`](./glossary.md) → [`style-cs.md`](./style-cs.md) →
   [`constructions-cs.md`](./constructions-cs.md) →
   [`exemplars-cs.md`](./exemplars-cs.md).

Consequences that bite:

- **The old guardrail is inverted.** "Don't rewrite the source to make the
  translation easier" now protects `en`, not `cs`. Existing `cs` copy is
  *in scope* for rewriting — that is the point of the flip.
- **`leftover-source` now means leftover English in the `cs` column**, not the
  reverse.
- **A surface hardcoded in Czech is still a coverage gap**, and now needs `en`
  authored from the call site rather than translated from the Czech that
  happens to be sitting there. Read the component, not just the string.
- Most published localization advice assumes an English source. For this repo
  that is now finally true — but note `constructions-en.md` was written for the
  *old* direction and is being re-scoped (below).

## Runtime: two different "defaults" — do not conflate them

`src/lib/format.ts` deliberately exports two constants:

| Constant | Value | Governs |
|---|---|---|
| `DEFAULT_LOCALE` | `"en"` | The UI language an **unidentified visitor** gets (no locale cookie). Used by `getServerLocale`, the `TDict` fallback, `getMessages`, `<html lang>`. |
| `HOME_MARKET_LOCALE` | `"cs"` | The market this deployment **counts money in** and writes background output for. Binds the module-level `fmt*` exports (~199 call sites), `csvNum`, chart axis defaults, cron-sent stock alerts, newsletter labels. |

Flipping the UI default to `en` while leaving `HOME_MARKET_LOCALE` at `cs`
moved **zero numbers**. Collapsing them back into one constant would silently
reprice a Czech client's dashboard in USD — `LOCALES.en.currency` is `"USD"`.
Pass an explicit locale wherever the reader's own locale is known.

**Known, deliberate mismatch:** `metadata` in `src/app/layout.tsx` (title,
description, opengraph-image) is still Czech while `<html lang>` defaults to
`en`. Metadata is prerendered under Cache Components and cannot read the locale
cookie without making every route dynamic, so the static share surface is a
Czech-market SEO decision (see the DECISION note on `SITE_DESCRIPTION` in
`src/lib/site.ts`), not a translation gap. Don't "fix" it as part of a
translation wave.

## Artifacts in this repo

| File | Holds |
| --- | --- |
| `glossary.md` | termbase — what to call things |
| `style-en.md` | voice for the **source** column: how English UI copy in this product sounds |
| `style-cs.md` | voice for the **target** column |
| `constructions-cs.md` | **the anchor set for translationese** — how to build the Czech sentence out of English. The load-bearing artifact for the current direction. |
| `exemplars-cs.md` | gold en→cs pairs |
| `constructions-en.md` | **legacy direction (cs→en).** Written when English was derived. Still useful for *cleanup*: the existing `en` column was translated out of Czech, so its rules describe real defects still sitting in the catalog. It is not a guide for authoring new English — `style-en.md` is. Retire it once the `en` re-authoring pass is complete. |
| `exemplars-en.md` | gold pairs from the old direction; same caveat |
| `lessons-i18n.md` | field notes from a full-catalog sweep on a sibling product — read before a large run |
| `progress.md` | the resumable ledger for the multi-session re-authoring pass |

## Catalog layout — colocated, not central

- **Central dictionary** (`src/lib/i18n/messages.ts`): only `nav` / `footer` /
  `switcher` — chrome shared across pages. `Messages` is an explicit interface
  typing **both** columns, so either one missing a key is a **type error** —
  the TS compiler is the parity gate; there is no parity script.
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
- **There are FOUR locale-table shapes, and any tool must handle all of them.**
  Every one of these was discovered the hard way, by an agent noticing the audit
  had reported a file clean that plainly wasn't:

  | Shape | Example | What a naive parser does |
  |---|---|---|
  | 1. One block, two object columns | `const T = { cs: {…}, en: {…} }` | the only shape most parsers expect |
  | 2. Same, but **array** columns | `MACROS = { cs: [...], en: [...] }` (`ReviewInbox`) | requiring `cs: {` reports every string as hardcoded |
  | 3. **Per-string inline pairs** | `{ cs: "…", en: "…" }` (`lp/page.tsx`, `mapa`, `OrganicChannels` label maps) | reports fully-localized strings as coverage gaps |
  | 4. **Two separate top-level consts** | `const cs: Messages = {…}` … `const en: Messages = {…}` (`lib/i18n/messages.ts`) | the file is invisible — **the central nav/footer dictionary went unaudited entirely** |

  Identify a locale table by **content, never by identifier**. The names in the
  wild include `T`, `LEGAL_CONTENT`, `CONTENT`, `PLAN_COPY`, `MACROS`,
  `SAMPLE_T`, `SAVE_ERROR_T`, `PERKS`, `INSIGHT_T`. Anchoring on `const T`
  reports the four largest localized surfaces as 100 % untranslated; anchoring
  on "any identifier containing a capital T" swallows `const LEGAL_TEXT = {`
  and hides them completely. Both mistakes were made and corrected in
  `scripts/i18n-audit.mjs` — see `tableRanges()`, `inlinePairs()` and
  `splitConstColumns()`.
- **Keys are not one-per-line.** `localeColumn()` must not anchor on `^…$`:
  `ReviewInbox` packs several pairs per line and a line-anchored regex saw 7 of
  its 48.
- Many tables close with `} as const;`, not `};` — any script that parses them
  must brace-match, not look for a literal `\n};`. A naive parser silently
  reports every string in those tables as "hardcoded".

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
  `czPlural(n, one, few, many)` exists in `src/lib/format.ts` for the call
  sites that already do this (alert titles); it is not wired into `interpolate`.

## Numbers / dates / currency

`createFormatters(locale)` in `src/lib/format.ts` (client: `useFormatters()`,
server: `getServerFormatters()`) — cs → cs-CZ/CZK, en → en-US/USD. **Never
hardcode a formatted number/price/date into a string**; keep it a placeholder
and let the formatters produce it.

## Coverage model (what "full coverage" means here)

A surface is covered when every user-facing string it renders flows through
`useT`/`getT`/`getMessages`. Coverage work = externalizing hardcoded JSX
strings into a colocated `T` table:

- Hardcoded **English** string → becomes the `en` value; check it against
  `style-en.md` (it was written inline, not reviewed), then transcreate `cs`.
- Hardcoded **Czech** string → **write `en` from the call site's functionality**
  (not from the Czech), then treat the existing Czech as a draft `cs` value to
  be checked against the artifacts — mechanical typography fixes at minimum.
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
| `npm run test:unit` | 2 123 node:test assertions; several pin locale-dependent formatting |

Typecheck cannot see a key whose translated value was never written: the
fallback is `dict[locale] ?? dict.en`, so a **cs** gap now silently renders
English to Czech users (before the flip it was the reverse). That missing check
is **`node scripts/i18n-audit.mjs`**, which reports three things typecheck can't:

| Signal | Meaning |
|---|---|
| coverage | user-facing Czech rendered outside any locale table |
| leftover | `cs` value byte-identical to `en`, minus the Do-Not-Translate list |
| register | *tykání* in the `cs` column (`constructions-cs.md` § CS-REGISTER) |

`--json` for machine output, `--check` to exit non-zero on leftover/register
findings (suitable for CI once the catalog is clean). It is **not** in
`check:ci` yet — the coverage gap would fail the build today.

## Do-not-translate seeds

Adamant (client brand), mionelo.cz, Systedo, product/tool names (Google Ads,
Sklik, Gemini, Firestore, SQLite, GA4), marketing metrics kept as-is in Czech
HR/marketing speech: PNO, CAC, LTV, PPC, SEO, CTR, ROAS, RSA, CPC, UX.
"Case study" stays English in cs (established usage in the app).

## Call-site lookup

Colocated by construction — the `T` table sits in the same file as its usage;
grep `useT(` / `getT(` / `getMessages` to find adopters.

## Operational notes

- 915 tracked `.ts`/`.tsx` files under `src`; **195 adopters** and **3 286
  cs/en pairs** as of 2026-08-05 (`node scripts/i18n-audit.mjs`). Batch coverage
  work **by file** (the tables are
  per-file — this parallelizes cleanly with zero merge conflicts if agents own
  disjoint files).
- Client vs server: `"use client"` at the top → `useT`; otherwise async server
  component → `await getT(T)`. Mixed files: hooks only in the client parts.
- Keep `T` tables typed by inference against `TDict<K>` — copy the shape of an
  existing adopter (e.g. `LtvModule.tsx`).
- Shared checkout with a concurrent agent: **pathspec commits only**
  (`git add <paths>` then `git commit <same paths>`), never `-A`.
</content>
</invoke>
