# Social Media Planning — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 2 medium / 1 low)

## 1. Retry after a mid-batch failure duplicates already-saved posts
- **Severity**: High
- **Lens**: ambiguity
- **Category**: partial-batch-idempotency
- **File**: src/components/social/WeekPlanner.tsx:216-278
- **Scenario**: 7 topics are running; topic 5's draft or save call fails (429, expired session, flaky network). The loop `break`s, and — deliberately — the topics textarea is kept "so the user can retry without retyping". The user clicks "Naplánovat týden" again.
- **Root cause**: The retry path re-runs the whole list from topic 1, but topics 1–4 were already persisted as `scheduled` posts in the first run. There is no per-topic success tracking (e.g., removing succeeded lines from the textarea, or a dedupe key on save), so "keep the topics on failure" and "retry from scratch" are in direct conflict.
- **Impact**: Every retry double-schedules everything that succeeded before the failure point — duplicate posts pile up in the calendar and PostsList, and the user must manually hunt and delete them. The failure UX actively creates data mess.
- **Fix sketch**: On failure, set `topics` to only the unprocessed lines (`topicLines.slice(i).join("\n")`) instead of the full original text, and adjust the error copy to say "X of Y scheduled — remaining topics kept below". Alternatively track succeeded topic indexes and filter them out.

## 2. Late topics are scheduled onto day 8+, outside the visible 7-day calendar
- **Severity**: High
- **Lens**: ui
- **Category**: calendar-window-mismatch
- **File**: src/components/social/WeekPlanner.tsx:212-214,242-243,384-386
- **Scenario**: It's 14:00 and the chosen hour is 10 (the default). The first slot rolls to tomorrow (`first.setDate(+1)`), so topic i lands on `tomorrow + i`. With 7 topics the last one is scheduled 8 days from today — but the calendar renders exactly `buildWeek()`'s 7 days starting today.
- **Root cause**: The batch's scheduling window (starts today *or tomorrow*, depending on the current time vs. `hour`) and the calendar's rendering window (always today+6) are computed independently and can be offset by one day; the UI copy promises the posts are "spread across the coming days" with no hint of the shift.
- **Impact**: After a "successful" run, one (or more, after the today/tomorrow roll) post is invisible in the week grid. Users conclude generation silently dropped a topic — a trust-breaking phantom-loss experience even though the data is fine.
- **Fix sketch**: Anchor `buildWeek` to the same `first` date used for scheduling (or render 8 cells when the start rolled over), or simplest: always start scheduling tomorrow and render tomorrow+6, so the windows are identical by construction.

## 3. Silent partial success: fewer posts than the promised topics × platforms
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: silent-skip-success-theater
- **File**: src/components/social/WeekPlanner.tsx:241-246,192-199,205
- **Scenario**: The summary line promises "3/7 témat × 3 sítě = 9 příspěvků". `/api/social/draft` returns drafts for only 2 of the 3 requested platforms for some topic (model omission, server-side filter). The save loop `continue`s past the missing/empty draft with no counter and no error.
- **Root cause**: The per-draft guard `if (!d?.content || !platforms.has(d.platform)) continue;` treats a missing platform draft as a non-event, and progress is counted in *topics* (`{done}/{total}` = topics) while the user was sold a *posts* total — two different units with no reconciliation at the end.
- **Impact**: The run completes green, the textarea clears, but the calendar holds fewer posts than promised. There is no signal which platform/topic combination went missing, so users on multi-platform runs can't trust the batch without manually auditing every cell.
- **Fix sketch**: Count saved posts and compare against `topicLines.length * platforms.size`; on mismatch show a non-fatal notice ("8 z 9 příspěvků vytvořeno — pro X/TikTok se nepodařilo vygenerovat text"). Bonus: make the progress denominator posts, matching the batchSummary units.

## 4. Topic list silently truncated at 7 lines
- **Severity**: Medium
- **Lens**: ui
- **Category**: silent-truncation
- **File**: src/components/social/WeekPlanner.tsx:186-190
- **Scenario**: A user pastes 10 topic lines from a doc. `topicLines` is `.slice(0, 7)`; the counter shows "7/7 témat" and the run schedules only the first 7 — lines 8–10 are ignored, then the (deliberate) clear-on-success wipes them from the textarea too.
- **Root cause**: The 7-cap (a "week" heuristic, undocumented anywhere in the UI beyond the `{n}/7` fraction) is applied by silently dropping the tail rather than surfacing an over-limit state.
- **Impact**: Real content the user typed is discarded without warning, and after a successful run it's gone entirely. The `{n}/7` label reads as progress-toward-a-goal, not "excess will be dropped".
- **Fix sketch**: When raw line count exceeds 7, show a warning variant of the counter ("10 témat — naplánuje se prvních 7, zbytek zůstane v poli") and on success keep the un-run tail lines in the textarea instead of clearing everything.

## 5. Manual brand voice is a one-shot mount snapshot that never refreshes
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: stale-localstorage-snapshot
- **File**: src/components/social/WeekPlanner.tsx:100-108,132,229,292
- **Scenario**: The user edits their brand voice in the Composer (which owns `app:social-brand`) and then plans a week without reloading the page.
- **Root cause**: `const [brand] = useState(readSocialBrand)` reads localStorage exactly once at mount with no setter, no storage/custom-event listener, and no re-read at `planWeek` time — unlike `posts`, which do listen to `social:posts-changed`.
- **Impact**: The batch generates with an outdated voice, and the "Píše na značku" banner's show/hide condition (`!brand.trim() && autoBrand`) can misrepresent which voice will actually be used in this session. Low because it self-heals on reload and the auto-derived voice covers the common case.
- **Fix sketch**: Read `readSocialBrand()` fresh inside `planWeek()` (it is only needed there and in the banner condition), or subscribe to a `social:brand-changed` event mirroring the existing posts-changed pattern. Related trivium: the `topicCount`/`topicCountPlural` i18n keys are dead — `batchSummary` replaced them — and can be deleted.
