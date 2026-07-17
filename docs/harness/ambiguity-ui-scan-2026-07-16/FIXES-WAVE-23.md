# Fixes — Wave 23 (module-clustered tail: core platform, UI shell, app metadata)

Branch `vibeman/ambiguity-ui-2026-07-16`. Reports: `core-platform-infra.md`,
`ui-shell-nav-i18n-tokens.md`, `app-infra-metadata.md`.

Scope: 3 High + 9 Medium + 2 Low = 14 findings. **13 fixed, 1 already-resolved
by an earlier wave.** tsc clean throughout; `npm run test:unit` **1771/1771**
(baseline 1764 + 7 new tests), 0 regressions.

## Commits

| # | Commit | Finding | Sev |
|---|--------|---------|-----|
| 1 | fix(admin): add server-only guard | core-platform #3 | M |
| 2 | fix(export): BOM as escape, not invisible literal | core-platform #5 | M |
| 3 | fix(nav): diacritics-strip regex escapes | ui-shell #3 | M |
| 4 | fix(db): SCHEMA-vs-MIGRATIONS split-brain guard + comment | core-platform #2 | High |
| 5 | fix(design-tokens): theme-independent on-swatch ink | ui-shell #1 | High |
| 6 | fix(site): coherently-Czech static share metadata | app-infra #1 | High |
| 7 | fix(readiness): warn RESEND_API_KEY without ALERT_FROM_EMAIL | core-platform #4 | M |
| 8 | fix(template): segment-based fade denylist matching | app-infra #3 | M |
| 9 | fix(design-system): Swatch shared clipboard helper + failure state | app-infra #4 | M |
| 10 | fix(app): error/404 CTAs through the Button SSOT | app-infra #2 | M |
| 11 | fix(nav): drift guard pinning cs nav dict to NAV_ITEMS | ui-shell #2 | M |
| 12 | fix(site): SITE_DESCRIPTION i18n gap resolved; STACK_FACTS documented | ui-shell #4 | M |
| 13 | fix(i18n): derive locale universe from SUPPORTED_LOCALES | ui-shell #5 | Low |
| 14 | fix(sitemap): repair comment + source article path from nav | app-infra #5 | Low |

**Already resolved (skipped):** core-platform **#1** (CSV formula guard turning
negative numbers into text) — an earlier wave already added the `PLAIN_NUMBER`
carve-out in `csvCell`; verified present, no action.

## Narratives (the two Highs of note)

- **db split-brain (#2, core-platform).** A table added only to the `SCHEMA`
  constant reaches fresh DBs (via migration v1) but never pre-existing ones (already
  stamped at v1, never re-run), throwing "no such table" only in long-lived/prod
  environments. Added a loud INVARIANT comment above `SCHEMA` and a unit test that
  carries a frozen v1-era fixture DB forward through the migrations and diffs its
  table set against a fresh-migrated DB — fails the moment the two drift.

- **theme-blind swatch ink (#1, ui-shell).** `readableInkOn` chose ink from the
  parsed light-mode hex but returned `var(--color-ink)`, which dark mode flips to
  near-white → white ink on light swatches on the /design-system showcase. Now
  returns a fixed dark-ink literal, and the Swatch paints from the same parsed hex
  (not the live var) so background/label/ink share one theme-independent source.
  `branding/compute.ts` only tests the white-vs-not distinction → unaffected.

## New tests (+7)
- `db-migrations.test.mjs`: split-brain table-set diff (+1)
- `design-tokens-ink.test.mjs` (new): ink is theme-independent literal / light-dark
  selection / choice depends only on hex (+3)
- `readiness.test.mjs`: RESEND-without-ALERT_FROM_EMAIL warning + clears (+1)
- `nav-search.test.mjs`: cs nav dict mirrors NAV_ITEMS (+1)
- `format-locale.test.mjs`: SUPPORTED_LOCALES is the derivation source (+1)

## Behavior changes needing sign-off
1. **Static share metadata is now Czech** (app-infra #1). Root `<title>` default,
   OpenGraph title + description and the meta description now render Czech (was
   English) to match the Czech OG image + `lang="cs"` default. English copy is kept
   as `SITE_DESCRIPTION_EN` for future locale-aware use. This is a brand-copy / SEO
   decision — confirm Czech is the intended static share language.
2. **/kampane blurb says "SQLite" but campaigns live in Firestore.** `NAV_ITEMS`
   and `MESSAGES.cs.nav.items` both say "…uložením do SQLite"; `db.ts` + the
   `STACK_FACTS` data line say Firestore (with a local SQLite twin only in LOCAL_DB
   mode). Left the case-study narrative copy untouched (product decision) — decide
   which the /kampane page should claim, then update both (the new drift guard keeps
   them in sync).
3. **error/404 CTA styling** now flows through `buttonClass` (the DS SSOT): drops
   the bespoke `active:scale-[0.99]` press animation and the secondary link shifts
   `font-semibold`/`text-navy-800` → the SSOT's `font-medium`/`text-navy-700`.
   Intentional (that's the centralisation), noting the tiny visual delta.

## Patterns
- Two-source-of-truth findings closed with a **guard test** rather than a risky
  restructure (nav dict ↔ NAV_ITEMS; SCHEMA ↔ MIGRATIONS; locale universe).
- Invisible-character findings (BOM, combining-mark range) rewritten as `\uXXXX`
  escapes — identical runtime bytes, diff-visible intent.
- Dead-code honesty: `STACK_FACTS` is unused, so it was **documented** (cs-only,
  localize-via-Messages-if-wired) rather than gold-plated with i18n infrastructure.
- Readiness/degradation warnings routed through the existing `productionWarnings`
  boot channel instead of adding a new surface.
