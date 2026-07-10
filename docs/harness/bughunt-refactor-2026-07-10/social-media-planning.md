# Social Media Planning

> Total: 5
> Critical: 0 · High: 2 · Medium: 2 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. `planWeek` never checks the posts-save response — scheduled posts silently dropped

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/social/WeekPlanner.tsx:240-244`
- **Scenario**: In the batch loop, the *draft* response is checked (`if (!draftRes.ok) { setError(...); break; }` at line 229), but the *save* call `await fetch("/api/social/posts", { method: "POST", ... })` at 240-244 discards its result entirely — no `res.ok`, no `await res.json()`, no try-specific handling. If `/api/social/posts` returns 401 (session expired mid-batch), 429 (per-user rate-limit — the endpoint has one), or 500, the fetch resolves normally, `setProgress({ done: i + 1, ... })` still increments, and the button ends on "Plan the week" with no error. The user sees the progress bar complete and believes the week is scheduled.
- **Root cause**: assumes a resolved `fetch` promise means the POST succeeded; conflates transport success with HTTP success (`fetch` only rejects on network failure, not 4xx/5xx).
- **Impact**: success theater — some or all scheduled posts are never persisted, the calendar cells stay empty, and there is no error to explain why. Directly defeats the one job of the "Plan the week" button.
- **Fix sketch**: capture the response, and on `!res.ok` set an error + `break` (mirroring the draft-response guard at 229-232), or collect a per-post failure count and surface "scheduled X of Y". Don't advance `progress` for a post that failed to save.

## 2. Midnight schedule hour silently rewritten to 10:00

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/social/WeekPlanner.tsx:209`
- **Scenario**: `first.setHours(Number(hour) || 10, 0, 0, 0)`. The hour `<input type="number" min={0} max={23}>` legitimately allows `0` (midnight). When the user types `0`, `Number("0")` is `0`, and `0 || 10` evaluates to `10` — so a batch the user scheduled for 00:00 is silently posted at 10:00 instead. Every other hour (1-23) works; only the boundary value 0 is corrupted.
- **Root cause**: `|| 10` used as an "empty/NaN" fallback, but `0` is a valid, falsy input value — the classic falsy-zero guard bug.
- **Impact**: wrong publish time with no feedback; a user deliberately scheduling overnight posts gets 10 a.m. instead. Silent data-wrong.
- **Fix sketch**: parse explicitly and only fall back on NaN/out-of-range, e.g. `const h = Number(hour); const safeHour = Number.isInteger(h) && h >= 0 && h <= 23 ? h : 10;` then `first.setHours(safeHour, 0, 0, 0)`.

## 3. 7-topic batch after the chosen hour pushes the last post outside the visible week

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/social/WeekPlanner.tsx:208-245` (calendar window built at `buildWeek`, `WeekPlanner.tsx:84-98`)
- **Scenario**: `first` starts today, but "if that's already past, start tomorrow" (line 210) moves it to today+1. Post `i` is scheduled on `first + i` days (237). With the full 7 topics allowed (`.slice(0, 7)`), the last post lands on `today + 7`. The calendar, however, only renders `buildWeek` = today … today+6 (7 cells). So whenever the chosen hour has already passed, the 7th scheduled post is created successfully but falls on a day with no calendar cell and is invisible in the planner.
- **Root cause**: the schedule origin can shift forward by a day, but the display window is fixed to `today..today+6`; the two ranges are assumed to always coincide and don't.
- **Impact**: user schedules 7 posts, sees only 6 in the calendar, and reasonably concludes one failed (or re-runs and double-books). Confusing at best, duplicate posting at worst.
- **Fix sketch**: either cap topics to `first`-relative capacity (6 when `first` is tomorrow), or build the calendar window starting at `first`/covering `first..first+6`, or render an "N more scheduled beyond this week" affordance. Keep the display window and the schedule origin derived from the same base date.

## 4. Partial-failure and success both wipe the topics textarea

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/social/WeekPlanner.tsx:229-253`
- **Scenario**: On a draft failure the loop does `setError(...); break` (229-232) or `setError(...); break` in the catch (247-250). After the loop, execution unconditionally reaches `setTopics("")` (253) — so even when only the first of, say, five topics was drafted before the server errored, the user's entire multi-line topic list is cleared. The error message tells them it failed, but the input they'd need to retry is already gone.
- **Root cause**: the "clear input on completion" step is placed after the loop with no distinction between a clean finish and an aborted-by-`break` run.
- **Impact**: input loss on any partial failure; the user must retype every topic to retry, and can't tell which topics already produced posts.
- **Fix sketch**: track a `failed` flag (set alongside each `break`) and only `setTopics("")` when the loop completed without breaking; or clear only the topics that were successfully scheduled. Leave the textarea intact on error.

## 5. Dead i18n keys `topicCount` / `topicCountPlural` in the WeekPlanner string table

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: dead-code
- **File**: `src/components/social/WeekPlanner.tsx:30-31,49-50`
- **Scenario**: The `T` table defines `topicCount` and `topicCountPlural` in both `cs` and `en`, but `topicCountLabel` (192-199) only ever selects between `topicCountZero` and `batchSummary`. A repo-wide grep for `topicCount`/`topicCountPlural` returns only these four definition lines and no `t("topicCount"...)`/`t("topicCountPlural"...)` call site — they are unreferenced. (New: the prior 2026-07-09 report flagged cross-component duplication and the SocialClient split, but not these dead keys.)
- **Root cause**: an earlier singular/plural count label was replaced by the `batchSummary` "topics × networks" line; the superseded keys were left behind.
- **Impact**: dead strings that must be kept translated and mislead future editors into thinking a singular/plural count path exists; harmless at runtime.
- **Fix sketch**: delete the `topicCount` and `topicCountPlural` entries from both locale blocks. Keep `topicCountZero` and `batchSummary`, which are the live keys.
