/** Content-schedule compute (src/lib/content-schedule/compute.ts) + seeded board
 *  (sample.ts): status rollup, idea queue, calendar layout, next-free-day, determinism. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calendarGrid,
  clearLibraryLinks,
  clearWithdrawnLinks,
  ideas,
  nextFreeDay,
  planSlotSeed,
  reconcileWithChannel,
  slotProgress,
  statusCounts,
  workingList,
} from "@/lib/content-schedule/compute";
import {
  channelSendAt,
  initialPosts,
  MIN_SEND_LEAD_MS,
  PLAN_SEND_HOUR,
  POST_STATUSES,
  WINDOW_DAYS,
} from "@/lib/content-schedule/sample";

const post = (over = {}) => ({
  id: "p",
  title: "Nabídka",
  service: "Sluzba",
  area: "Praha",
  status: "scheduled",
  day: 0,
  ...over,
});

test("statusCounts tallies every state in the union", () => {
  const c = statusCounts([
    post({ status: "idea", day: null }),
    post({ status: "scheduled", day: 3 }),
    post({ status: "queued", day: 4 }),
    post({ status: "published", day: 1 }),
    post({ status: "done", day: 2 }),
    post({ status: "idea", day: null }),
  ]);
  assert.deepEqual(c, { idea: 2, scheduled: 1, queued: 1, published: 1, done: 1 });
  // Every member of the union is a key — a status added to sample.ts cannot be
  // silently dropped from the rollup.
  assert.deepEqual(Object.keys(c).sort(), [...POST_STATUSES].sort());
});

test("ideas returns only unscheduled posts", () => {
  const posts = [post({ id: "a", status: "idea", day: null }), post({ id: "b", status: "scheduled", day: 2 })];
  assert.deepEqual(ideas(posts).map((p) => p.id), ["a"]);
});

test("calendarGrid has 28 cells and places posts by day; ideas excluded", () => {
  const grid = calendarGrid([
    post({ id: "a", day: 0 }),
    post({ id: "b", day: 0 }),
    post({ id: "c", day: 5 }),
    post({ id: "d", status: "idea", day: null }),
  ]);
  assert.equal(grid.length, WINDOW_DAYS);
  assert.deepEqual(grid[0].map((p) => p.id), ["a", "b"]);
  assert.deepEqual(grid[5].map((p) => p.id), ["c"]);
  assert.equal(grid.flat().length, 3); // idea 'd' excluded
});

test("nextFreeDay finds the first under-capacity day", () => {
  // day 0 full (2), day 1 has 1 → next free is day 1
  const posts = [post({ id: "a", day: 0 }), post({ id: "b", day: 0 }), post({ id: "c", day: 1 })];
  assert.equal(nextFreeDay(posts, 2), 1);
  // empty board → day 0
  assert.equal(nextFreeDay([], 2), 0);
});

test("nextFreeDay returns null when every day is at capacity (no overbooking)", () => {
  // Fill all 28 days to capacity 2 → no free day.
  const full = [];
  for (let d = 0; d < WINDOW_DAYS; d++) {
    full.push(post({ id: `a${d}`, day: d }), post({ id: `b${d}`, day: d }));
  }
  assert.equal(nextFreeDay(full, 2), null);
  // one freed slot on the last day → that day, not null
  full.pop();
  assert.equal(nextFreeDay(full, 2), WINDOW_DAYS - 1);
});

test("initialPosts is deterministic and catalog-grounded", () => {
  const project = { id: "demo-local", type: "local" };
  const localities = [{ id: "praha", name: "Praha", region: "Praha" }];
  const services = [
    { id: "s1", name: "Sluzba A", serviceAreas: ["praha"] },
    { id: "s2", name: "Sluzba B", serviceAreas: ["praha"] },
  ];
  const a = initialPosts(project, services, localities);
  const b = initialPosts(project, services, localities);
  assert.deepEqual(a, b);
  assert.equal(a.length, 2);
  for (const p of a) {
    assert.ok(["idea", "scheduled", "done"].includes(p.status));
    if (p.status === "idea") assert.equal(p.day, null);
    else assert.ok(p.day >= 0 && p.day < WINDOW_DAYS);
    assert.ok(p.title.includes(p.service) || p.title.includes(p.area));
  }
});

test("initialPosts seeds finished slots in the past half and scheduled in the upcoming half", () => {
  // Enough combos that both statuses appear; the day anchor must read chronologically.
  const project = { id: "chrono-demo", type: "local" };
  const localities = [
    { id: "praha", name: "Praha" },
    { id: "brno", name: "Brno" },
  ];
  const services = Array.from({ length: 6 }, (_, i) => ({
    id: `s${i}`,
    name: `Sluzba ${i}`,
    serviceAreas: ["praha", "brno"],
  }));
  const half = Math.floor(WINDOW_DAYS / 2);
  for (const p of initialPosts(project, services, localities, 12)) {
    if (p.status === "done") assert.ok(p.day < half, `done on day ${p.day} not < ${half}`);
    if (p.status === "scheduled") assert.ok(p.day >= half, `scheduled on day ${p.day} not >= ${half}`);
  }
});

// ── the plan may promise; only the channel may confirm ────────────────────────

test("the seeded board can never claim a channel publish", () => {
  const project = { id: "honest-demo", type: "local" };
  const localities = [{ id: "praha", name: "Praha" }, { id: "brno", name: "Brno" }];
  const services = Array.from({ length: 6 }, (_, i) => ({
    id: `s${i}`,
    name: `Sluzba ${i}`,
    serviceAreas: ["praha", "brno"],
  }));
  for (const p of initialPosts(project, services, localities, 12)) {
    assert.notEqual(p.status, "published", "a fixture has been through no channel");
    assert.notEqual(p.status, "queued");
    assert.equal(p.channelPostId, undefined);
  }
});

test("workingList is what the maker can still act on (ideas + planned days)", () => {
  const posts = [
    post({ id: "a", status: "idea", day: null }),
    post({ id: "b", status: "scheduled", day: 2 }),
    post({ id: "c", status: "queued", day: 3 }),
    post({ id: "d", status: "published", day: 1 }),
    post({ id: "e", status: "done", day: 0 }),
  ];
  assert.deepEqual(workingList(posts).map((p) => p.id), ["a", "b"]);
  assert.deepEqual(ideas(posts).map((p) => p.id), ["a"]);
});

// channel-present path -------------------------------------------------------

test("a slot linked to a channel post follows the CHANNEL, not the board", () => {
  const linked = (over = {}) =>
    post({ id: "x", status: "queued", day: 3, channelPostId: "sp-1", channelPlatform: "facebook", ...over });

  // the channel confirmed it went out → published
  assert.equal(reconcileWithChannel([linked()], [{ id: "sp-1", status: "published" }])[0].status, "published");
  // still waiting in the channel → queued (a promise, not a publish)
  assert.equal(reconcileWithChannel([linked()], [{ id: "sp-1", status: "scheduled" }])[0].status, "queued");
  assert.equal(reconcileWithChannel([linked()], [{ id: "sp-1", status: "publishing" }])[0].status, "queued");
  // the channel FAILED → back to the plan, flagged, never a publish
  const failed = reconcileWithChannel([linked()], [{ id: "sp-1", status: "failed" }])[0];
  assert.equal(failed.status, "scheduled");
  assert.equal(failed.channelFailed, true);
  // even a board that stored "published" is overruled by a channel that says otherwise
  const overruled = reconcileWithChannel([linked({ status: "published" })], [{ id: "sp-1", status: "failed" }])[0];
  assert.equal(overruled.status, "scheduled");
});

const withdrawnSlot = () =>
  post({
    id: "x",
    status: "published",
    day: 3,
    channelPostId: "sp-gone",
    channelPlatform: "facebook",
    channelSendAt: "2026-08-10T07:00:00.000Z",
  });

test("a link whose channel post is gone drops back to the plan and SAYS SO", () => {
  const [slot] = reconcileWithChannel([withdrawnSlot()], []);
  assert.equal(slot.status, "scheduled");
  // the withdrawal is news, not a silent revert
  assert.equal(slot.channelWithdrawn, true);
  // …and it is not a failure: the channel did not try and fail, someone removed it
  assert.equal(slot.channelFailed, false);
  // the dead link survives reconciliation as the evidence the board's one-shot
  // cleanup keys off — reconcile is pure and cannot persist anything itself
  assert.equal(slot.channelPostId, "sp-gone");
});

test("a live channel post clears a stale withdrawal flag", () => {
  const relinked = post({ id: "x", status: "scheduled", day: 3, channelPostId: "sp-1", channelWithdrawn: true });
  const [slot] = reconcileWithChannel([relinked], [{ id: "sp-1", status: "scheduled" }]);
  assert.equal(slot.status, "queued");
  assert.equal(slot.channelWithdrawn, false);
});

test("clearWithdrawnLinks persists the withdrawal and strips the dead link", () => {
  const board = reconcileWithChannel([withdrawnSlot(), post({ id: "y", status: "idea", day: null })], []);
  const cleaned = clearWithdrawnLinks(board);
  assert.ok(cleaned, "there is something to clean after a withdrawal");
  const [slot, untouched] = cleaned;
  // the news survives…
  assert.equal(slot.channelWithdrawn, true);
  assert.equal(slot.status, "scheduled");
  // …the platform survives (which channel it was), the dead promise does not
  assert.equal(slot.channelPlatform, "facebook");
  assert.equal(slot.channelPostId, undefined);
  assert.equal(slot.channelSendAt, undefined);
  assert.deepEqual(untouched, board[1]);
  // never mutates
  assert.equal(board[0].channelPostId, "sp-gone");
});

test("the withdrawal cleanup is one-shot and survives the next load", () => {
  const cleaned = clearWithdrawnLinks(reconcileWithChannel([withdrawnSlot()], []));
  // nothing left to clean → no second write is ever issued
  assert.equal(clearWithdrawnLinks(cleaned), null);
  // and a board with no channel link is left alone by the next reconciliation,
  // so the persisted flag is what the maker keeps seeing
  const [again] = reconcileWithChannel(cleaned, []);
  assert.equal(again.channelWithdrawn, true);
  assert.equal(again.status, "scheduled");
  assert.equal(clearWithdrawnLinks([again]), null);
});

test("clearWithdrawnLinks is a no-op on a board that never touched a channel", () => {
  assert.equal(clearWithdrawnLinks([post({ id: "a", status: "idea", day: null }), post({ id: "b" })]), null);
});

// channel-absent path --------------------------------------------------------

test("a legacy locally-flipped 'published' slot is downgraded to marked-done", () => {
  const out = reconcileWithChannel(
    [
      post({ id: "legacy", status: "published", day: 2 }),
      post({ id: "claimed", status: "queued", day: 4 }),
      post({ id: "plain", status: "scheduled", day: 5 }),
      post({ id: "idea", status: "idea", day: null }),
    ],
    []
  );
  assert.deepEqual(out.map((p) => p.status), ["done", "done", "scheduled", "idea"]);
});

test("reconcile never mutates the input board", () => {
  const input = [post({ id: "x", status: "published", day: 1 })];
  const snapshot = JSON.parse(JSON.stringify(input));
  reconcileWithChannel(input, []);
  assert.deepEqual(input, snapshot);
});

test("channelSendAt maps a plan day onto a real future instant", () => {
  // 2026-08-04, 06:00 local — day 0's 9:00 is still ahead.
  const now = new Date(2026, 7, 4, 6, 0, 0).getTime();
  const today = new Date(channelSendAt(0, now));
  assert.equal(today.getHours(), PLAN_SEND_HOUR);
  assert.equal(today.getDate(), 4);
  const later = new Date(channelSendAt(3, now));
  assert.equal(later.getDate(), 7);
  assert.equal(later.getHours(), PLAN_SEND_HOUR);
  // …and a day whose hour has already gone still lands in the FUTURE, because the
  // posts API rejects a past scheduledAt (and must never fall through to publish-now).
  const late = new Date(2026, 7, 4, 21, 30, 0).getTime();
  assert.ok(Date.parse(channelSendAt(0, late)) >= late + MIN_SEND_LEAD_MS);
});

// ── activity taxonomy: one writer, no double-count ───────────────────────────

/** The board writes its state through /api/projects/[id]/state/content-schedule,
 *  whose `event` field emits an activity row. The old "published" event wrote
 *  "Příspěvek publikován (GBP)" for a transition that sent nothing anywhere; and a
 *  channel handoff must not write a SECOND row, because /api/social/posts already
 *  writes "Příspěvek naplánován" for exactly that action. Both rules are properties
 *  of this component's source, so they are asserted on it. */
test("the schedule surface emits no publish event of its own", () => {
  const src = readFileSync(
    new URL("../src/components/app/modules/ContentSchedule.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(!/persist\([^)]*"published"/.test(src), 'no persist(..., "published") event');
  assert.ok(!/patch\([^;]*"published"\s*\)/.test(src), "no locally-claimed publish transition");
  // the ONLY named event left is the plan placement
  const events = [...src.matchAll(/persist\(next,\s*"([a-z-]+)"\)|patch\([^;]*?,\s*"([a-z-]+)"\)/g)]
    .map((m) => m[1] ?? m[2])
    .filter(Boolean);
  assert.deepEqual([...new Set(events)], ["scheduled"]);
  // and the way out of the app is the EXISTING social pipeline, not a second one
  assert.ok(src.includes('"/api/social/posts"'), "reuses the social posts pipeline");
});

// ── the calendar as the place work starts ────────────────────────────────────

test("planSlotSeed carries what the slot already decided", () => {
  const seed = planSlotSeed(post({ id: "post-3", title: "Nabídka: Rozvody v Brně", service: "Rozvody", area: "Brno" }));
  assert.deepEqual(seed, {
    topic: "Nabídka: Rozvody v Brně",
    primaryKeyword: "Rozvody Brno",
    keywords: [],
    planSlotId: "post-3",
  });
  // Structurally a BriefSeed (topic/primaryKeyword/keywords), so it rides the
  // EXISTING sessionStorage brief-seed bridge unchanged.
  for (const key of ["topic", "primaryKeyword", "keywords"]) assert.ok(key in seed);
  assert.ok(JSON.parse(JSON.stringify(seed)).planSlotId, "survives the sessionStorage round-trip");
});

test("planSlotSeed degrades gracefully when the slot has no locality", () => {
  assert.equal(planSlotSeed(post({ service: "Rozvody", area: "" })).primaryKeyword, "Rozvody");
  assert.equal(planSlotSeed(post({ service: "", area: "" })).primaryKeyword, "");
});

test("slotProgress refines the status union rather than replacing it", () => {
  assert.equal(slotProgress(post({ status: "idea", day: null })), "planned");
  assert.equal(slotProgress(post({ status: "scheduled" })), "planned");
  assert.equal(slotProgress(post({ status: "scheduled", briefStartedAt: "2026-08-04T09:00:00.000Z" })), "drafting");
  assert.equal(slotProgress(post({ status: "scheduled", briefStartedAt: "x", libraryEntryId: "e-1" })), "drafted");
  assert.equal(slotProgress(post({ status: "idea", day: null, body: "Text příspěvku" })), "drafted");
  // whitespace is not a draft
  assert.equal(slotProgress(post({ status: "scheduled", body: "  " })), "planned");
  // anything the board has handed over or ticked off is out of the working list
  for (const status of ["queued", "published", "done"]) {
    assert.equal(slotProgress(post({ status })), "out");
  }
});

test("the seeding + link-back contract is wired at both ends", () => {
  const board = readFileSync(
    new URL("../src/components/app/modules/ContentSchedule.tsx", import.meta.url),
    "utf8"
  );
  const engine = readFileSync(
    new URL("../src/components/app/modules/ContentEngine.tsx", import.meta.url),
    "utf8"
  );
  // the calendar seeds through the EXISTING bridge, not a new one
  assert.ok(board.includes("briefSeedKey(projectId)"), "reuses the brief-seed sessionStorage key");
  assert.ok(board.includes("planSlotSeed(post)"), "seeds from the slot's own content");
  assert.ok(/router\.push\(`\/app\/\$\{projectId\}\/obsahovy-engine`\)/.test(board));
  // …and the engine links what it produced back to that slot, recording the asset
  // itself in the content library rather than copying it onto the board
  assert.ok(engine.includes("onSavedToLibrary"), "the link-back rides the library save");
  assert.ok(engine.includes("libraryEntryId"), "the slot stores a pointer to the entry");
  assert.ok(!/status:\s*"drafted"/.test(engine), "no second status vocabulary");
});

// ── the write must land before the hop ────────────────────────────────────────

/** THE RACE this pins. `createContent` stamps `briefStartedAt` on the slot and
 *  navigates to the content engine. The engine, after a library save, reads the
 *  stored board, merges `libraryEntryId` into it and PUTs the whole blob back —
 *  and /api/projects/[id]/state/[key] is a blind last-writer-wins write. So a
 *  board PUT still in flight when we left could land after the engine's read and
 *  erase the pointer the engine had just recorded. The fix is ordering: the write
 *  is awaited before the navigation, which is a property of this source. */
test("createContent awaits the board write before navigating away", () => {
  const src = readFileSync(
    new URL("../src/components/app/modules/ContentSchedule.tsx", import.meta.url),
    "utf8"
  );
  // persist hands its promise back — a fire-and-forget `void fetch(...)` cannot be awaited
  assert.ok(!/function persist\([^)]*\)[^{]*\{\s*[\s\S]{0,80}void fetch\(/.test(src), "persist is awaitable");
  assert.ok(/function persist\([^)]*\): Promise<void>/.test(src), "persist declares a promise");
  assert.ok(/function patch\([^)]*\): Promise<void>/.test(src), "patch forwards that promise");
  const body = src.slice(src.indexOf("async function createContent"), src.indexOf("function setBody"));
  assert.ok(body.length > 0, "createContent is still there");
  const awaited = body.indexOf("await patch(");
  const pushed = body.indexOf("router.push(");
  assert.ok(awaited > -1, "the slot write is awaited");
  assert.ok(pushed > awaited, "…and the navigation happens after it, not beside it");
});

// ── the calendar is reachable by keyboard and screen reader ──────────────────

/** The day chips used to be inert <div>s whose whole state lived in `title=` —
 *  unreachable by keyboard, touch, or a screen reader's default reading — and the
 *  `+{n}` overflow was a dead label hiding the rest of the day from every input. */
test("calendar day chips and the overflow are real controls", () => {
  const src = readFileSync(
    new URL("../src/components/app/modules/ContentScheduleCalendar.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(!/title=\{\s*\n?\s*t\(STATUS_LABEL_KEY/.test(src), "state no longer lives only in title=");
  assert.ok(src.includes("sr-only"), "the state is announced without expanding anything");
  assert.equal((src.match(/aria-expanded=/g) ?? []).length, 2, "the chip AND the overflow disclose");
  assert.ok(src.includes('role="group"'), "each day is a labelled group");
  assert.ok(/aria-label=\{t\("dayLabel"/.test(src), "…with a real name, not just a number");
  assert.ok(/onClick=\{\(\) => setExpandedDay\(/.test(src), "the overflow reveals the rest of the day");
  assert.ok(src.includes("focus-visible:ring"), "focus is visible");
});

// ── the public demo does not push an anonymous visitor at a sign-in wall ─────

/** DemoModule renders this board with a demo project id and no session: every
 *  persist 401s silently and every cross-module link redirects to sign-in. The
 *  SaveToLibrary pattern (isDemoProjectId → offer nothing) applied module-wide. */
test("on a demo id the board neither writes nor links out", () => {
  const src = readFileSync(
    new URL("../src/components/app/modules/ContentSchedule.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(src.includes('from "@/lib/projects/demo"'), "reuses the shared demo-id predicate");
  assert.ok(/const demo = isDemoProjectId\(projectId\)/.test(src));
  // the write path short-circuits before the fetch
  assert.ok(/if \(demo\) return Promise\.resolve\(\)/.test(src), "no persist on a demo id");
  // and the links that would bounce the visitor are gated on the same flag
  assert.ok(/socialLinked = isModuleAvailable\([^)]*\) && !demo/.test(src));
  assert.ok(/engineLinked = isModuleAvailable\([^)]*\) && !demo/.test(src));
  assert.ok(src.includes('t("demoNote")'), "…and the demo says why");
});

// ── a deleted library entry must not leave the slot claiming a draft ─────────

test("clearLibraryLinks drops a pointer to a deleted entry, keeping the work started", () => {
  const board = [
    post({ id: "a", libraryEntryId: "ent-1", briefStartedAt: "2026-08-01T10:00:00.000Z" }),
    post({ id: "b", libraryEntryId: "ent-2" }),
  ];
  const next = clearLibraryLinks(board, "ent-1");
  assert.ok(next, "there was a pointer to clear");
  assert.equal(next[0].libraryEntryId, undefined);
  // the slot stops claiming a finished draft…
  assert.equal(slotProgress(next[0]), "drafting");
  // …but does not pretend the work never started
  assert.equal(next[0].briefStartedAt, "2026-08-01T10:00:00.000Z");
  // other slots are untouched, and the input is never mutated
  assert.equal(next[1].libraryEntryId, "ent-2");
  assert.equal(board[0].libraryEntryId, "ent-1");
});

test("clearLibraryLinks skips the write when nothing pointed at the entry", () => {
  assert.equal(clearLibraryLinks([post({ id: "a" })], "ent-1"), null);
  assert.equal(clearLibraryLinks([post({ id: "a", libraryEntryId: "ent-2" })], "ent-1"), null);
  assert.equal(clearLibraryLinks([post({ id: "a", libraryEntryId: "ent-1" })], ""), null);
});
