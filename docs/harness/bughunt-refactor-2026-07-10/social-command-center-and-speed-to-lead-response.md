# Social Command Center & Speed-to-Lead Response

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Scheduled posts fire late by the user's UTC offset (naive-local time compared to a UTC clock)

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/social/store.ts:72`
- **Scenario**: `SocialClient.tsx` binds the schedule field to `<input type="datetime-local">` (`SocialClient.tsx:538`) and POSTs its raw value unchanged: `scheduledAt: scheduledAt || undefined` (`SocialClient.tsx:369`). The route stores it verbatim — `str(body.scheduledAt)` (`api/social/posts/route.ts:44,49`) — so a Prague user (UTC+2) who picks 18:00 stores the timezone-naive string `"2026-07-10T18:00"`. The cron's `listDueScheduled` then decides "due" with `(p.scheduledAt ?? "") <= nowIso` where `nowIso = new Date().toISOString()` is UTC-with-`Z` (`store.ts:68-72`). Lexicographically the bare local string only becomes `<= nowIso` when the *UTC* wall-clock reaches 18:00 — i.e. 20:00 Prague. The post publishes two hours late. Worse, the two producers disagree: `WeekPlanner.tsx:243` sends `when.toISOString()` (correct UTC `Z`), so within the same tenant WeekPlanner posts fire on time while SocialClient posts fire offset — the same list, two behaviours.
- **Root cause**: `scheduledAt` is treated as an opaque, directly-comparable string, but one client sends timezone-naive local wall-clock while the comparison baseline is UTC ISO. There is no normalization to a single instant.
- **Impact**: Wrong-time publishing — scheduled social posts go out hours off the marketer's intent (and shift again across DST), silently, with no error. User-visibly broken once real publishing is wired.
- **Fix sketch**: Normalize at the write boundary in `api/social/posts/route.ts`: convert `scheduledAt` to a canonical UTC ISO instant before persisting (e.g. `new Date(scheduledAt).toISOString()`, matching what `future` already parses), so both producers and the `store.ts:72` comparison speak UTC. Keep `datetime-local` on the client but interpret it as local when converting.

## 2. `updatePost` set-merge resurrects a user-deleted post as a malformed partial document

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/lib/social/store.ts:57`
- **Scenario**: `updatePost` writes with `postsCol(tenant).doc(id).set(patch, { merge: true })` — a Firestore upsert that **creates** the doc if it no longer exists. The cron reads the due set once (`listDueScheduled`, `cron/social/route.ts:27`) then loops publishing (`route.ts:28-41`). If the user deletes a scheduled post (`deletePost`, `store.ts:60`) after it was read but before the cron's `updatePost` runs, the merge-set re-materializes the deleted doc carrying only `{ status:"published", publishedAt, externalUrl }` — no `platform`, `content`, or `createdAt`. `listPosts` (`store.ts:47`) then returns this ghost with `content`/`platform` undefined, and the UI renders an empty "published" post the user thought they deleted.
- **Root cause**: A mutation-only helper uses upsert (`set … merge`) instead of an existence-requiring `update()`, so a concurrent delete is silently undone with a partial record.
- **Impact**: State corruption / success theater — a deleted post reappears as a broken published entry; downstream code that assumes `content`/`platform` are present can also throw when rendering it.
- **Fix sketch**: Change `updatePost` to `postsCol(tenant).doc(id).update(patch)` (throws `NOT_FOUND` on a missing doc), or have the cron re-check existence inside the publish loop and skip/no-op when the doc is gone, so a delete wins the race instead of being resurrected.

## 3. `connectAccount` read-modify-write drops a connection under concurrent linking

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/social/connection.ts:39`
- **Scenario**: `connectAccount` does `listAccounts` (read) → `filter` → `push` → `ref(userId).set({ accounts }, { merge: true })` (`connection.ts:40-47`). `merge:true` merges top-level fields but an array field is **replaced wholesale**, not element-merged. If the user links two platforms nearly simultaneously (double-click, two tabs, or a "connect all" fan-out), both handlers read the same base array, each appends only its own platform, and the later write clobbers the earlier — one connection is silently lost. `disconnectAccount` (`connection.ts:50`) has the same read-modify-write shape and can equally undo a concurrent connect.
- **Root cause**: Multi-writer state (the `accounts` array) is mutated via read-then-overwrite with no transaction or atomic array op; `merge:true` gives a false sense of safety because it does not merge array elements.
- **Impact**: A platform the user believes they connected is missing from `socialConnections/{userId}`, so the publish cron (`listConnectedSocialUserIds`) skips it and their scheduled posts never go out.
- **Fix sketch**: Use `FieldValue.arrayUnion(account)` / `arrayRemove(...)` for the write, or wrap the read-modify-write in a `firestore.runTransaction`, so concurrent link/unlink operations compose instead of clobbering.

## 4. No claim-before-publish: overlapping cron runs can double-publish a scheduled post

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/app/api/cron/social/route.ts:28`
- **Scenario**: The publish loop reads posts still in `status:"scheduled"`, calls `publishPost`, then updates them to `published` (`route.ts:28-41`). There is no atomic "claim" of the post before sending — the status flip happens *after* the external publish. With `maxDuration = 300` and a slow provider call, if a second cron invocation starts before the first has flipped the row (Vercel does not guarantee non-overlapping runs), both list the same still-`scheduled` post and both publish it. Today `publishPost` is a simulated no-op (`publish.ts:19-27`) so the effect is a harmless double `updatePost`; once the real Meta/LinkedIn seam lands, the same window produces a duplicate public post.
- **Root cause**: The scheduled→published transition is not a compare-and-set claim performed before the side effect; the "send then mark" ordering leaves a re-entrancy window.
- **Impact**: Latent — benign while publishing is simulated, but a duplicate live post (and inflated `published` counts) the moment real publishing is implemented; also masks failures because a second run re-processes a row the first already sent.
- **Fix sketch**: Claim before send — atomically transition the row to an in-flight status (e.g. `update` guarded by a transaction that asserts `status === "scheduled"`) and only call `publishPost` if the claim succeeded, so a concurrent run finds nothing to do.

## 5. `getAccount` is an unused export (dead code)

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: dead-code
- **File**: `src/lib/social/connection.ts:55`
- **Scenario**: `export async function getAccount(userId, platform)` returns a single connected account. A repo-wide `\bgetAccount\b` grep finds only this definition — no import anywhere in `src/` (the similarly named `getAccountName` in `google/ads.ts` is unrelated). All real callers use `listAccounts`/`listConnectedSocialUserIds` instead. This is distinct from the prior report's `SOCIAL_PLATFORM_VALUES` (store.ts) and the `publishPost` dead-`if` findings.
- **Root cause**: A convenience accessor was added to the connection module but never wired to a caller and never removed.
- **Impact**: Dead surface a future reader must reason about (does anything depend on its `?? null` behaviour?) before touching the connection store; zero runtime effect.
- **Fix sketch**: Delete `getAccount` from `src/lib/social/connection.ts` (lines 55-57). No import sites to update.
