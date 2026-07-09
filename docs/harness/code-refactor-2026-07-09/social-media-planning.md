# Social Media Planning

> Context #15 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 3, Low: 0)
> Files read: 2

## 1. Inline `InboxMessage` type re-derives the store's `SocialMessage`

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/social/SocialClient.tsx:132-142`
- **Scenario**: `InboxMessage` redeclares every field of `SocialMessage` (`src/lib/social/types.ts:62-71`) by hand, plus one extra optional field `suggestedReply`. The API route that feeds this component (`src/app/api/social/messages/route.ts:22-25`) literally returns `{ ...m, suggestedReply }` where `m` is a `SocialMessage` — i.e. the wire shape already *is* `SocialMessage & { suggestedReply?: string }`, but `Inbox()`'s `load()` (line 703) casts the JSON response straight to `{ messages?: InboxMessage[] }` with no runtime check.
- **Root cause**: the component was written against a locally-copied shape instead of importing the canonical one from `src/lib/social/types.ts`.
- **Impact**: the two declarations can silently drift — if `SocialMessage` gains or renames a field (store/API side), `InboxMessage` won't follow, TypeScript won't flag the mismatch (the fetch result is type-asserted, not validated), and the inbox UI will misrender or drop data with no compile error.
- **Fix sketch**: replace the local interface with `import type { SocialMessage } from "@/lib/social/types";` and `interface InboxMessage extends SocialMessage { suggestedReply?: string }` in `SocialClient.tsx`. No behavior change — same fields, same optionality.

## 2. Auto-brand fetch effect duplicated verbatim in Composer and WeekPlanner

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/social/SocialClient.tsx:292-307`
- **Scenario**: `Composer()`'s `autoBrand` effect fetches `/api/projects/${pid}/brand-context`, parses `{ context }`, and guards against a stale response with a `live` flag — and `src/components/social/WeekPlanner.tsx:135,161-174` implements the exact same 14 lines (same URL, same `.then` chain, same `live` guard) independently. Both files' comments even call out the intended parity ("C1 unify… parity with the WeekPlanner strip" at `SocialClient.tsx:292-293`; "C1: the project's auto-derived brand voice" at `WeekPlanner.tsx:133-134`) — the server side was already unified into `loadBrandContext()` (`src/lib/brand/load.ts`), but the client-side fetch never was.
- **Root cause**: each component independently re-implemented the client call to the same shared endpoint instead of factoring it into a hook.
- **Impact**: any future fix (error handling, caching, race-condition edge case) has to be applied twice or the two surfaces silently diverge in behavior.
- **Fix sketch**: extract a small client hook, e.g. `useAutoBrandContext(pid: string | undefined): string` in a new `src/lib/social/client.ts` (or similar), encapsulating the fetch + `live`-guard + cleanup. Have both `Composer` and `WeekPlanner` call it instead of maintaining their own `useEffect`.

## 3. Posts fetch + `social:posts-changed` listener duplicated in PostsList and WeekPlanner

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/social/SocialClient.tsx:570-589`
- **Scenario**: `PostsList()`'s `load()` builds `/api/social/posts?projectId=…` (or the bare path), fetches, and unwraps `{ posts }`; the enclosing effect then subscribes to a `social:posts-changed` window event to re-run it. `WeekPlanner.tsx:141-159`'s `loadPosts()` does the identical URL-build/fetch/unwrap and the identical event subscription (its effect additionally calls `buildWeek(fmt)`, which is WeekPlanner-specific and should stay).
- **Root cause**: both components need "the current post list, kept fresh across the two components," but each re-derives it locally rather than sharing a hook — the `social:posts-changed` custom-event convention is already a de facto shared contract between the two files.
- **Impact**: low bug risk today since both copies are currently in sync, but it's the same maintenance-cost pattern as #2 — a fix to error handling or the query-param shape must be made twice.
- **Fix sketch**: extract `useSocialPosts(pid: string | undefined)` returning `{ posts, reload }` that owns the fetch, the `social:posts-changed` listener, and the cleanup. `PostsList` uses it directly; `WeekPlanner`'s effect keeps its own `buildWeek(fmt)` call alongside the hook's `reload()`.

## 4. Local brand-storage read reimplemented instead of shared with Composer

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/social/WeekPlanner.tsx:100-108`
- **Scenario**: `readSocialBrand()` re-reads the `"app:social-brand"` localStorage key that `Composer()` in `src/components/social/SocialClient.tsx:275-291` already owns (it reads the same key on mount at line 278 and writes it on change at line 287). `WeekPlanner` only needs the read half but reimplements it with a slightly different guard (`typeof window === "undefined"` check) than Composer's effect-only, try/catch-only version.
- **Root cause**: no shared accessor exists for the one localStorage key both components rely on, so each file grew its own copy of "how to read the brand voice safely."
- **Impact**: low today, but the key name `"app:social-brand"` is a bare string literal in three separate places (`SocialClient.tsx:278,287`, `WeekPlanner.tsx:104`); a typo in any one of them would silently desync the two surfaces with no compiler error.
- **Fix sketch**: add a small pure helper `getSocialBrand(): string` (the SSR-guarded body of today's `readSocialBrand`) next to the other social constants, export the key name as a constant, and have both `Composer`'s read effect and `WeekPlanner`'s `useState(readSocialBrand)` call the shared helper instead of duplicating the try/catch.

## 5. `SocialClient.tsx` bundles four unrelated UI sections in one 809-line file

- **Severity**: Medium
- **Category**: structure
- **File**: `src/components/social/SocialClient.tsx:1-809`
- **Scenario**: the file defines `AccountsBar` (167-258), `Composer` (262-558, the largest single piece — brand voice, AI drafting, and the publish form), `PostsList` (562-664), and `Inbox` (668-809) as four independently-scrollable, unrelated concerns in one module, each with its own state, effects, and local `T` translation table already living at the top of the file (25-130). `WeekPlanner`, doing comparably-scoped work, already lives in its own file in the same directory — this file is the outlier.
- **Root cause**: the four sections were grown incrementally inside the original `SocialClient` component rather than split out as the file grew.
- **Impact**: no correctness cost, but the file is hard to navigate/review as a unit (four unrelated diffs land in the same file) and its size discourages the kind of targeted testing the smaller `WeekPlanner.tsx` gets more easily.
- **Fix sketch**: split `AccountsBar.tsx`, `Composer.tsx`, `PostsList.tsx`, and `Inbox.tsx` out under `src/components/social/`, each keeping its own slice of the `T` table (or a shared `src/components/social/i18n.ts` if the strings overlap), and have `SocialClient.tsx` become a thin composer that imports and lays them out — mirroring the precedent `WeekPlanner.tsx` already sets in this directory.
