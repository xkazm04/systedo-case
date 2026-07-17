# Fixes — Wave 25 (project shell / settings / onboarding · data spine · lifecycle UI)

Module-clustered tail wave over the project shell/settings/onboarding pages, the
project data spine (`projects` / `project-state` / `project-data`), and the project
lifecycle UI. 13 findings assigned (1 High · 10 Medium · 2 Low) — **all 13 fixed**,
none skipped. Branch `vibeman/ambiguity-ui-2026-07-16`.

## Commits

| # | Commit | Finding | Sev | Scope |
|---|--------|---------|-----|-------|
| 1 | `a7f94d4` | project-shell #1 | High | projects (guard + layout) |
| 2 | `be5550f` | project-shell #2 | M | app layout |
| 3 | `0cdcc02` | project-shell #3 | M | nastaveni |
| 4 | `dbbde57` | project-shell #4 | M | ucet |
| 5 | `c0b2419` | data-spine #1 | M | project-state |
| 6 | `87f9056` | data-spine #2 | M | project-state |
| 7 | `a7fe146` | data-spine #3 | M | project-data |
| 8 | `18c2378` | data-spine #4 | M | projects |
| 9 | `fec2aa5` | data-spine #5 | Low | projects |
| 10 | `cb6d412` | lifecycle #3 | M | projects-home |
| 11 | `77c64be` | lifecycle #4 | M | overview |
| 12 | `f33cee7` | lifecycle #5 | M | project-switcher |
| 13 | `2292b99` | project-shell #5 | Low | projects (guard + all module pages) |

## Narratives

1. **Expired session → sign-in, not 404.** Both the project layout guard and
   `requireProjectModule` hit `notFound()` when the session cookie expired mid-nav
   (the /app AuthGate never re-runs on client-side module navigation), dropping the
   user on the root 404 that reads as "your project was deleted". Both now
   `redirect("/app")` on a missing user; `notFound()` stays reserved for the
   missing/foreign-project case (anti-enumeration preserved).
2. **Auth-gate loading shell.** The /app layout's Suspense fallback was `null`, which
   under Cache Components IS the prerendered static shell — a white flash on every
   cold entry, silent to screen readers. Reused the sibling /app/page.tsx
   `role="status"` reveal shell.
3. **Stale BYOM rationale.** The nastaveni header claimed account-wide keys live there
   "since the app has no dedicated account area" — but /ucet has since shipped. Comment
   reconciled; ByomKeys already states the account scope in its subtitle.
4. **/ucet sentinels.** `user.id` fell back to a literal `"—"` (data-model pollution),
   the expiry date was UTC-sliced (off-by-one for Czech users), and `sessionCount` was
   `0` for both dev-auth and a real zero. Now id is `null` (component renders the dash),
   the full ISO instant is formatted client-side via the locale/TZ-aware `fmtDate`, and
   sessionCount is `null` for dev-auth/failed reads → "unavailable".
5. **Corrupt project-state logged.** `getProjectState` collapsed "no row" and "corrupt
   blob" into one bare `catch { return null }`, so a corrupt blob made the caller reseed
   and the next save clobber the recoverable original — silently. Both backends now
   `console.error` with (userId, projectId, key) before returning null.
6. **project-state size budget.** `saveProjectState` was unbounded but Firestore caps a
   doc at 1 MiB while the sqlite dev backend has none — a prod-only 500 the dev path can't
   reproduce. The dispatcher now measures the serialized blob and throws a typed
   `ProjectStateTooLargeError` past a 900 KiB budget, so both backends fail identically.
   Envelope documented.
7. **Conversions floored at 1.** On a low-magnitude/low-type project, per-field
   `Math.round` could round conversions to 0 while cost rounded nonzero → CPA=cost/0 and
   conv-rate=0 on daily drilldowns. New `roundCount` floors any positive scaled count at 1
   (true zeros stay 0) in both `scaledDataset` and `applyProjectShape`; the "pointwise
   identical ratios" invariant doc now carves out this integer-quantization exception.
8. **Shared patch normalizer.** The two project backends only converged on read-back
   shape: local trimmed logoUrl/domain and stored NULL to clear, Firestore wrote `""`
   verbatim (and createProject wrote `domain: ""` for whitespace). Extracted
   `normalizeProjectPatch` (trim, empty→null) called by both; Firestore now maps a cleared
   field to `FieldValue.delete()` and guards createProject with `domain?.trim()`.
9. **Blank rename rejected at the store.** `updateProject` wrote `patch.name` verbatim —
   `""`/`"   "` survived only because the one current caller filtered it. The normalizer
   now trims name and drops a blank rename, enforcing the "always has a display name"
   invariant regardless of caller.
10. **Localized duplicate suffix.** The duplicate dialog hardcoded `${name} (kopie)`,
    baking a Czech word into an en-locale user's project name. Added a `dupSuffix` key
    ("(kopie)"/"(copy)").
11. **Named PNO threshold + accessible.** The portfolio table's magic `0.2` green/coral
    cutoff was type-blind and color-only. Extracted `PNO_HEALTHY_MAX` (documented as a
    generic cross-type placeholder), added a `title` explaining the target and a non-color
    ▲ affix (+ sr-only text) on above-bar rows.
12. **ProjectSwitcher honest semantics.** It declared `role="menu"`/`menuitem` on a plain
    link list but implemented none of the menu keyboard contract. Dropped to disclosure
    semantics (`aria-expanded`/`aria-haspopup`, no menu roles) and added Escape-to-close
    with focus restore to the trigger.
13. **Guard returns {project, userId}.** The guard asserted the user internally but
    returned only the project, forcing three pages to re-fetch `currentUserId()` and
    re-handle a nullability it had already eliminated (notably the overview's dead
    `userId ? … : [project]` branch). Guard now returns both; page/start/integrace consume
    it directly, all other module pages destructure `{ project }` (tsc enforces every call
    site).

## Verification

- `npx tsc --noEmit`: **0 errors** (verified before every commit + by the pre-commit hook).
- `npm run test:unit`: **1780/1780 pass** (baseline 1771 + 9 new; 0 fail, 0 regressions).
- LLM contract eval: all 20 tool golden snapshots unchanged (no AI-tool code touched).
- New tests (9):
  - `project-state.test.mjs`: corrupt-blob logs-and-returns-null; oversized-blob rejected
    with `ProjectStateTooLargeError`; under-budget blob still saves.
  - `project-dataset-shape.test.mjs`: low-magnitude days never show conversions=0 with cost>0
    (both `scaledDataset` and the project shape path).
  - `project-patch-normalize.test.mjs` (new file): absent-key leave-as-is; empty→null clear;
    trim; cleared-field-present-as-null; blank-rename dropped.

## Behavior changes needing sign-off

- **Session expiry now redirects to /app** (sign-in gate) instead of a 404. If any product
  copy or test asserted the 404 for signed-out project access, revisit.
- **Firestore clearing semantics changed**: clearing logoUrl/domain/adsCustomerId now issues
  `FieldValue.delete()` (removes the key) rather than storing `""`. Any Firestore query or
  security rule that expected an empty-string sentinel should be re-checked. (LOCAL_DB dev
  path already stored NULL — this only affects the cloud backend.)
- **`saveProjectState` can now throw** `ProjectStateTooLargeError` past 900 KiB. No current
  caller approaches this, but callers persisting open-ended state should catch it (or prune)
  rather than let it surface as an unhandled 500.
- **Blank project renames are now silently ignored** at the store layer (the existing name is
  kept) instead of writing an empty name — a stricter, safer contract.

## Patterns

- Node's test runner strips types in "strip-only" mode: **TS parameter properties**
  (`constructor(readonly x: T)`) are unsupported and crash the whole suite at import — use
  explicit field declarations + assignment for any class an .mjs test imports.
- Return-shape refactor of a widely-called guard (`Project` → `{ project, userId }`) is safe
  under tsc: every un-migrated `const project = await guard()` becomes a type error, so tsc
  is a complete migration checklist across ~30 call sites.
- Client-side date formatting (component `useFormatters().fmtDate(iso)`) fixes UTC
  off-by-one for free — the browser's locale + timezone are the right context, versus a
  server-side ISO string slice.
