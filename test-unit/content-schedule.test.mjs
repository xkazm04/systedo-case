/** Content-schedule compute (src/lib/content-schedule/compute.ts) + seeded board
 *  (sample.ts): status rollup, idea queue, calendar layout, next-free-day, determinism. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calendarGrid,
  ideas,
  nextFreeDay,
  reconcileWithChannel,
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

test("a link whose channel post is gone drops back to the plan with its claim cleared", () => {
  const [slot] = reconcileWithChannel(
    [post({ id: "x", status: "published", day: 3, channelPostId: "sp-gone", channelPlatform: "facebook", channelSendAt: "2026-08-10T07:00:00.000Z" })],
    []
  );
  assert.equal(slot.status, "scheduled");
  assert.equal(slot.channelPostId, undefined);
  assert.equal(slot.channelPlatform, undefined);
  assert.equal(slot.channelSendAt, undefined);
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
