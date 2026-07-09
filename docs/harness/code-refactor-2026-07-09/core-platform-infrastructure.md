# Core Platform Infrastructure

> Context #45 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 2, Low: 2)
> Files read: 26

## 1. Two Vercel Cron routes bypass the constant-time `cronAuthorized()` guard

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/cron-auth.ts:15-19`
- **Scenario**: `cron-auth.ts` exists specifically to SHA-256-digest both sides and `timingSafeEqual`-compare them so the `CRON_SECRET` never leaks via a timing side-channel (its own docblock says so). `src/app/api/cron/sync/route.ts`, `.../digest/route.ts`, `.../microsite/route.ts` and `.../catalog-sync/route.ts` all correctly `import { cronAuthorized } from "@/lib/cron-auth"`. But `src/app/api/cron/social/route.ts:12-16` and `src/app/api/cron/report/route.ts:19-23` each define their own local `authorized(request)` that does `request.headers.get("authorization") === \`Bearer ${secret}\``  — a plain, non-constant-time string comparison of the exact kind `cron-auth.ts` was built to avoid.
- **Root cause**: `cron-auth.ts` was factored out after some cron routes already existed (4 of 6 routes were migrated to it; 2 were missed).
- **Impact**: The app has two authorization implementations for the same guard and they disagree — a dev copying `social/route.ts` or `report/route.ts` as a template for the next cron endpoint propagates the weaker check. It also means the constant-time guarantee `cron-auth.ts` promises is only actually true for 4 of 6 cron endpoints today.
- **Fix sketch**: In `src/app/api/cron/social/route.ts` and `src/app/api/cron/report/route.ts`, delete the local `authorized()` function, add `import { cronAuthorized } from "@/lib/cron-auth"`, and replace `if (!authorized(request))` with `if (!cronAuthorized(request))` — matching the other four routes exactly. No change to `cron-auth.ts` itself required.

## 2. CSV escaping + client-download plumbing reimplemented three times

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/export.ts:8-53`
- **Scenario**: `export.ts` centralizes `csvField`/`toCsv` (semicolon-delimited, the Czech-Excel convention) and `downloadText` (Blob + UTF-8 BOM + anchor-click + `a.remove()` + `URL.revokeObjectURL`, no-op on the server). Two other places reimplement pieces of this instead of importing it: `src/lib/activity/compute.ts:36-39` defines its own RFC-4180 `csvCell` (comma-delimited), and `src/components/app/modules/ActivityModule.tsx:98-109`'s `exportCsv()` hand-rolls the entire download (`new Blob([...]) → createObjectURL → <a> → click → revokeObjectURL`) without the `typeof document === "undefined"` SSR guard and without `downloadText`'s `a.remove()` cleanup. Separately, `src/lib/catalog/export.ts:15-19` defines a third near-identical `csvField` (comma + CRLF, RFC 4180) for its Google-Ads-Editor exporter.
- **Root cause**: Each export surface was added independently and reached for "quote if it contains the delimiter/quote/newline" from scratch rather than reusing the shared helper; `catalog/export.ts`'s docblock even explicitly explains it avoids importing `@/lib/export` to "stay dependency-free" of the DOM, which was presumably read as "avoid the whole module" rather than "avoid only `downloadText`."
- **Impact**: Three copies of the same escaping predicate to keep in sync (a CRLF-vs-LF or RFC-4180 edge-case fix in one won't propagate to the others), and `ActivityModule.tsx`'s bespoke downloader is missing the cleanup `downloadText` already has, plus silently uses a `,` delimiter where every other export in the app uses `;` for the Czech-Excel convention `toCsv` was built around.
- **Fix sketch**: Have `ActivityModule.tsx`'s `exportCsv()` call `toCsv`/`downloadText` from `@/lib/export` instead of inlining the Blob/anchor logic (drop the redundant `csvCell` from `src/lib/activity/compute.ts` once nothing calls it). For `catalog/export.ts`, extract just the pure escaping predicate into `@/lib/export` as a delimiter-parameterized helper (e.g. `csvFieldFor(delimiterChars: string)`) so it stays DOM-free while sharing the one escaping rule with `csvField`/`csvCell`.

## 3. `db.ts`'s SCHEMA blob has grown to own 11 unrelated feature tables

- **Severity**: Medium
- **Category**: structure
- **File**: `src/lib/db.ts:66-220`
- **Scenario**: `db.ts`'s own docblock says it "backs two things only: the anonymous AI rate-limiter... and, in LOCAL_DB mode, the authed product's users/projects." In practice its `SCHEMA` template literal defines 14 tables, 11 of which are single-feature JSON blobs owned entirely by other modules: `project_catalog`, `project_state`, `report_metrics`, `local_signals`, `cost_model`, `competitors`, `organic_channels`, `twin`, `onboarding`, `warehouse_connection`, `byom_config` — each already has its own comment naming the `store.local.ts` that actually reads/writes it.
- **Root cause**: `getDb()`'s single shared `DatabaseSync` handle needs one atomically-applied `SCHEMA` string (the `SCHEMA_KEY`-gated re-apply is what makes an HMR'd dev server self-heal across a schema edit), so every LOCAL_DB-backed feature's DDL ended up appended to the one file that owns the connection.
- **Impact**: a "core platform infrastructure" file has 150+ lines of feature-specific DDL with nothing to do with rate-limiting or connection lifecycle; a dev adding a column to, say, `twin`'s local store today has to edit this shared cross-cutting file (and its `COLUMN_MIGRATIONS` array) rather than touching only `src/lib/twin/`.
- **Fix sketch**: No change to the runtime mechanism needed — keep one concatenated `SCHEMA` string and one atomic `db.exec(SCHEMA)`. Move each domain's table DDL into an exported string constant colocated with that domain (e.g. `TWIN_SCHEMA` in `src/lib/twin/store.local.ts`), and have `db.ts` do `const SCHEMA = CORE_SCHEMA + TWIN_SCHEMA + ONBOARDING_SCHEMA + ...`. This is pure code motion (identical final SQL, identical `SCHEMA_KEY`), so it carries no behavior risk — but it touches 11 files, so do it opportunistically (next time a feature's schema changes) rather than as one sweeping PR.

## 4. `firebaseApp` is exported but has no external consumer

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/lib/firebase.ts:39`
- **Scenario**: `export const firebaseApp = init();` — a repo-wide grep for `firebaseApp` across `src/` returns exactly three hits, all inside `firebase.ts` itself (the definition plus its own two internal uses feeding `getFirestore(firebaseApp)` and `getStorage(firebaseApp)`). No other module imports it; every consumer already goes through `firestore` or `storageBucket()`.
- **Root cause**: likely exported defensively for a future direct use (`getAuth(firebaseApp)`, `getMessaging(firebaseApp)`, etc.) that hasn't materialized.
- **Impact**: minor — a slightly wider public surface than the module needs; a future import of the raw `App` handle would bypass this module's accessor pattern instead of extending it (mirroring how `storageBucket()` wraps `getStorage`).
- **Fix sketch**: Drop the `export` keyword so `firebaseApp` is a module-local `const`; keep `firestore` and `storageBucket()` as the only two public exports. Re-export it later if a genuine direct consumer shows up.

## 5. `sendWebhook`/`sendEmail` duplicate the same fetch/ok-check/catch/log shape

- **Severity**: Low
- **Category**: duplication
- **File**: `src/lib/email.ts:7-25`
- **Scenario**: `sendWebhook` (lines 7-25) and `sendEmail` (lines 30-54) each: `fetch` a URL, check `res.ok` and `console.error` + `return false` on a non-OK response, `catch` and `console.error` + `return false` on a thrown error, and `return true` on success. The only real difference between the two is which URL/headers/body get built.
- **Root cause**: the two alerting channels were added independently, each writing its own copy of the same "best-effort POST" shape instead of factoring it out.
- **Impact**: small today (both are ~20 lines), but a future change to the error-logging format, a retry policy, or a timeout would need to land in both places — and the file's own framing ("best-effort outbound email/webhook alerting") suggests more channels (e.g. SMS) are a plausible addition, growing the duplication.
- **Fix sketch**: Add a private `postBestEffort(url: string, headers: Record<string,string>, body: unknown, tag: string): Promise<boolean>` helper in `email.ts` that does the fetch/ok-check/catch/log/return-boolean dance once, keyed off `tag` for the `[webhook]`/`[email]` log prefix; have `sendWebhook` and `sendEmail` call it with their own URL/headers/body.
