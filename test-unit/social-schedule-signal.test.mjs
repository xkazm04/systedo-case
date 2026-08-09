/** "Scheduled means it will publish" (src/lib/social/schedule-signal.ts +
 *  src/lib/social/account.ts demo handle).
 *
 *  The cron publishes only for users returned by listConnectedSocialUserIds — a
 *  user who schedules posts with zero connected accounts has them sitting
 *  `scheduled` forever. Both scheduling surfaces (WeekPlanner, PostsList) branch
 *  on this ONE pure rule, fed from the shared accounts store, so they cannot
 *  disagree about when to warn. Also pins the de-hardcoded demo account label:
 *  a minted account carries the caller's brand label or stays brand-neutral —
 *  never the placeholder "Mionelo". */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

let scheduleWillNotPublish;
let hasScheduledPosts;
let buildSocialAccount;
let demoAccountHandle;

before(async () => {
  const [signal, account] = await Promise.all([
    import("@/lib/social/schedule-signal"),
    import("@/lib/social/account"),
  ]);
  scheduleWillNotPublish = signal.scheduleWillNotPublish;
  hasScheduledPosts = signal.hasScheduledPosts;
  buildSocialAccount = account.buildSocialAccount;
  demoAccountHandle = account.demoAccountHandle;
});

// ── the disconnected-schedule warning rule ────────────────────────────────────

test("warns only when the account state is KNOWN and empty", () => {
  assert.equal(scheduleWillNotPublish({ accountsReady: true, accountCount: 0 }), true);
  // one connected account → the cron will walk this user
  assert.equal(scheduleWillNotPublish({ accountsReady: true, accountCount: 1 }), false);
  // fetch not answered yet → never flash a false alarm
  assert.equal(scheduleWillNotPublish({ accountsReady: false, accountCount: 0 }), false);
});

test("hasScheduledPosts: only the `scheduled` status is a pending cron promise", () => {
  assert.equal(hasScheduledPosts([]), false);
  assert.equal(hasScheduledPosts([{ status: "published" }, { status: "draft" }, { status: "failed" }]), false);
  assert.equal(hasScheduledPosts([{ status: "published" }, { status: "scheduled" }]), true);
});

// ── minted demo accounts carry the tenant's own label, never "Mionelo" ────────

test("demo handle carries the supplied brand label", () => {
  assert.equal(demoAccountHandle("instagram", "Pekárna U Lípy"), "Pekárna U Lípy (Instagram, demo)");
  const a = buildSocialAccount("facebook", { brandLabel: "Pekárna U Lípy", now: "t0" });
  assert.equal(a.demo, true);
  assert.equal(a.handle, "Pekárna U Lípy (Facebook, demo)");
});

test("without a brand label the demo handle stays brand-NEUTRAL (no Mionelo)", () => {
  const a = buildSocialAccount("facebook", { now: "t0" });
  assert.equal(a.demo, true);
  assert.match(a.handle, /demo/);
  assert.ok(!a.handle.includes("Mionelo"), `hardcoded placeholder brand leaked: ${a.handle}`);
  // whitespace-only labels are treated as absent
  assert.equal(demoAccountHandle("linkedin", "   "), "LinkedIn (demo)");
});
