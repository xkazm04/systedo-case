/** WP W3-D — the SOCIAL READ-BACK half: the insights adapters against a fixture
 *  transport (no network), the metric store's snapshot semantics against the LOCAL
 *  node:sqlite backend (table `social_post_metrics`, migration v33), the read-back step's
 *  due-gate and honest zero-work, and the byte-pinned grounding line.
 *
 *  The two honesty rules are the point of this file: a read that FAILED writes no row
 *  (failed ≠ zero), and with no rows the grounding is "" rather than a sentence claiming
 *  zero reach.
 *
 *  Temp-db pattern from outbound-stores-local.test.mjs; fixture-transport shape from
 *  social-providers.test.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-social-readback-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const {
  META_GRAPH_BASE,
  linkedinInsightsEndpoint,
  linkedinProvider,
  metaInsightsEndpoint,
  metaProvider,
  socialProvider,
} = await import("@/lib/social/providers");
const {
  SOCIAL_METRIC_RETENTION_DAYS,
  SOCIAL_PERFORMANCE_TOP_N,
  latestMetricByPost,
  metricDay,
  metricDayBefore,
  socialPerformanceLines,
} = await import("@/lib/social/metrics");
const {
  clearSocialMetricsForTenant,
  listPostMetricDays,
  pruneSocialMetrics,
  upsertSocialMetricDay,
} = await import("@/lib/social/metrics-store");
const {
  SOCIAL_READBACK_INTERVAL_MS,
  SOCIAL_READBACK_STEP_ID,
  runSocialReadback,
  socialReadbackStep,
} = await import("@/lib/social/readback-step");
const { LEDGER_STEPS } = await import("@/lib/cron/ledgers");
const { publishPost } = await import("@/lib/social/publish");

/** A fixture SocialTransport with a GET, recording each call so the URL + bearer can be
 *  asserted. No network. */
function fixtureTransport(response) {
  const calls = [];
  return {
    calls,
    async post(url, init) {
      calls.push({ verb: "POST", url, init });
      return response;
    },
    async get(url, init) {
      calls.push({ verb: "GET", url, init });
      return response;
    },
  };
}

// ── adapters ──────────────────────────────────────────────────────────────────

const META_INSIGHTS_RESPONSE = {
  insights: { data: [{ name: "post_impressions_unique", values: [{ value: 1240 }] }] },
  likes: { summary: { total_count: 87 } },
  comments: { summary: { total_count: 12 } },
};

test("meta insights: the right Graph URL, the bearer token, and an exact row", async () => {
  const t = fixtureTransport(META_INSIGHTS_RESPONSE);
  const res = await metaProvider.insights({ externalId: "12345_67890" }, { token: "tok-abc", transport: t });
  assert.deepEqual(res, { reach: 1240, likes: 87, comments: 12 });
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].verb, "GET");
  assert.equal(t.calls[0].init.token, "tok-abc");
  assert.ok(t.calls[0].url.startsWith(`${META_GRAPH_BASE}/12345_67890?`));
  assert.equal(t.calls[0].url, metaInsightsEndpoint("12345_67890"));
  assert.match(t.calls[0].url, /insights\.metric\(/);
});

test("meta insights: a post id with URL-hostile characters is encoded, not concatenated", () => {
  assert.ok(metaInsightsEndpoint("a/b?c").startsWith(`${META_GRAPH_BASE}/a%2Fb%3Fc?`));
});

test("meta insights: missing metrics read 0 — but only inside a read that SUCCEEDED", async () => {
  const t = fixtureTransport({});
  const res = await metaProvider.insights({ externalId: "x" }, { token: "t", transport: t });
  assert.deepEqual(res, { reach: 0, likes: 0, comments: 0 });
});

test("meta insights: a throwing transport PROPAGATES (the step must see the failure)", async () => {
  const boom = {
    async post() {
      throw new Error("nope");
    },
    async get() {
      throw new Error("social insights HTTP 400");
    },
  };
  await assert.rejects(
    () => metaProvider.insights({ externalId: "x" }, { token: "t", transport: boom }),
    /HTTP 400/
  );
});

test("a publish-only transport (no GET) is refused loudly, never answered with zeros", async () => {
  const publishOnly = {
    async post() {
      return {};
    },
  };
  await assert.rejects(
    () => metaProvider.insights({ externalId: "x" }, { token: "t", transport: publishOnly }),
    /no GET/
  );
});

test("linkedin insights: socialActions mapping, and reach stays 0 rather than invented", async () => {
  const t = fixtureTransport({
    likesSummary: { totalLikes: 41 },
    commentsSummary: { totalFirstLevelComments: 7 },
  });
  const res = await linkedinProvider.insights({ externalId: "urn:li:share:99" }, { token: "tok-li", transport: t });
  assert.deepEqual(res, { reach: 0, likes: 41, comments: 7 });
  assert.equal(t.calls[0].url, linkedinInsightsEndpoint("urn:li:share:99"));
  assert.equal(t.calls[0].init.token, "tok-li");
});

test("TikTok has no adapter at all, so it can never acquire numbers", () => {
  assert.equal(socialProvider("tiktok"), null);
});

test("both insights adapters stay behind configured() — no credentials, no live read", () => {
  // This suite runs with no META_/LINKEDIN_ credentials in env.
  assert.equal(metaProvider.configured(), false);
  assert.equal(linkedinProvider.configured(), false);
  assert.equal(typeof metaProvider.insights, "function");
  assert.equal(typeof linkedinProvider.insights, "function");
});

// ── externalId persistence ────────────────────────────────────────────────────

test("a SIMULATED publish carries no externalId — it has no platform-side object", async () => {
  const res = await publishPost("facebook", "ahoj", "post-1");
  assert.equal(res.simulated, true);
  assert.equal("externalId" in res, false);
});

// ── store: the snapshot rule ──────────────────────────────────────────────────

const TENANT = "u_uX_proj_pX";
const row = (postId, day, over = {}) => ({
  postId,
  day,
  tenant: TENANT,
  reach: 100,
  likes: 10,
  comments: 1,
  ...over,
});

test("ACCEPTANCE — a second read-back OVERWRITES the day, it does not double it", async () => {
  await upsertSocialMetricDay(row("p1", "2026-08-30", { reach: 1240, likes: 87, comments: 12 }));
  await upsertSocialMetricDay(row("p1", "2026-08-30", { reach: 1310, likes: 91, comments: 12 }));
  const rows = await listPostMetricDays(["p1"], "2026-01-01");
  assert.equal(rows.length, 1, "one row per (post, day), always");
  assert.deepEqual(
    { reach: rows[0].reach, likes: rows[0].likes, comments: rows[0].comments },
    { reach: 1310, likes: 91, comments: 12 }
  );
});

test("running the same write twice in a row is byte-identical (recompute-idempotent)", async () => {
  const r = row("p-idem", "2026-08-29", { reach: 5, likes: 4, comments: 3 });
  await upsertSocialMetricDay(r);
  const once = await listPostMetricDays(["p-idem"], "2026-01-01");
  await upsertSocialMetricDay(r);
  const twice = await listPostMetricDays(["p-idem"], "2026-01-01");
  assert.deepEqual(once, twice);
});

test("the read window is inclusive of sinceDay and ordered deterministically", async () => {
  await upsertSocialMetricDay(row("p2", "2026-08-28"));
  await upsertSocialMetricDay(row("p2", "2026-08-29"));
  await upsertSocialMetricDay(row("p3", "2026-08-29"));
  const rows = await listPostMetricDays(["p3", "p2"], "2026-08-29");
  assert.deepEqual(
    rows.map((r) => [r.day, r.postId]),
    [
      ["2026-08-29", "p2"],
      ["2026-08-29", "p3"],
    ]
  );
});

test("an empty id list never touches the backend", async () => {
  assert.deepEqual(await listPostMetricDays([], "2026-01-01"), []);
});

test("prune drops only rows older than the cutoff, and is itself idempotent", async () => {
  await upsertSocialMetricDay(row("p-old", "2025-01-01"));
  const dropped = await pruneSocialMetrics("2026-01-01");
  assert.ok(dropped >= 1);
  assert.equal(await pruneSocialMetrics("2026-01-01"), 0, "the second pass finds nothing left");
  assert.deepEqual(await listPostMetricDays(["p-old"], "2000-01-01"), []);
  assert.ok((await listPostMetricDays(["p1"], "2026-01-01")).length > 0, "newer rows survive");
});

test("the tenant scrub (the delete cascade's hook) leaves nothing of a project behind", async () => {
  await clearSocialMetricsForTenant(TENANT);
  for (const id of ["p1", "p2", "p3", "p-idem"]) {
    assert.deepEqual(await listPostMetricDays([id], "2000-01-01"), []);
  }
});

// ── pure model ────────────────────────────────────────────────────────────────

test("day keys are UTC, and the retention cutoff is the window's far edge", () => {
  assert.equal(metricDay(new Date("2026-08-30T23:59:59.000Z")), "2026-08-30");
  assert.equal(metricDayBefore(new Date("2026-08-30T00:00:00.000Z"), 1), "2026-08-29");
  assert.equal(SOCIAL_METRIC_RETENTION_DAYS, 180);
});

test("a post's CURRENT numbers are its newest day, never the sum of its days", () => {
  const latest = latestMetricByPost([
    row("p1", "2026-08-28", { reach: 100 }),
    row("p1", "2026-08-30", { reach: 1310 }),
    row("p1", "2026-08-29", { reach: 900 }),
  ]);
  assert.equal(latest.get("p1").reach, 1310);
});

// ── grounding ─────────────────────────────────────────────────────────────────

const post = (id, platform, content) => ({
  id,
  platform,
  content,
  status: "published",
  createdAt: "2026-08-01T00:00:00.000Z",
});

const POSTS = [
  post("p1", "facebook", "Nová směs ořechů je skladem — a je to naše nejlepší várka."),
  post("p2", "instagram", "Krátké video z pražírny"),
  post("p3", "linkedin", "Hledáme obchodního partnera pro firemní balíčky"),
  post("p4", "facebook", "Tenhle příspěvek nikdo nezměřil"),
];

const ROWS = [
  row("p1", "2026-08-30", { reach: 1310, likes: 91, comments: 12 }),
  row("p2", "2026-08-30", { reach: 4200, likes: 310, comments: 44 }),
  row("p3", "2026-08-30", { reach: 640, likes: 22, comments: 3 }),
];

test("ACCEPTANCE — the cs grounding line is byte-pinned, top-3 by real reach", () => {
  assert.equal(
    socialPerformanceLines(POSTS, ROWS, "cs"),
    "Nejlepší nedávné posty (reálná čísla): Instagram „Krátké video z pražírny“ — dosah 4200, reakce 310, komentáře 44; " +
      "Facebook „Nová směs ořechů je skladem — a je to naše nejlepší várka.“ — dosah 1310, reakce 91, komentáře 12; " +
      "LinkedIn „Hledáme obchodního partnera pro firemní balíčky“ — dosah 640, reakce 22, komentáře 3."
  );
});

test("ACCEPTANCE — the en grounding line is byte-pinned too", () => {
  assert.equal(
    socialPerformanceLines(POSTS, ROWS, "en"),
    "Best recent posts (real numbers): Instagram “Krátké video z pražírny” — reach 4200, likes 310, comments 44; " +
      "Facebook “Nová směs ořechů je skladem — a je to naše nejlepší várka.” — reach 1310, likes 91, comments 12; " +
      "LinkedIn “Hledáme obchodního partnera pro firemní balíčky” — reach 640, likes 22, comments 3."
  );
});

test("ACCEPTANCE — with NO rows the line is \"\", never a sentence claiming zero reach", () => {
  assert.equal(socialPerformanceLines(POSTS, [], "cs"), "");
  assert.equal(socialPerformanceLines(POSTS, [], "en"), "");
  assert.equal(socialPerformanceLines([], ROWS, "cs"), "");
});

test("a long caption is clamped to a recognisable fragment, whitespace collapsed", () => {
  const long = post("pl", "facebook", "  Tohle   je\nhodně\tdlouhý popisek, který se do jedné řádky grounding line rozhodně nevejde.  ");
  const line = socialPerformanceLines([long], [row("pl", "2026-08-30", { reach: 9, likes: 1, comments: 0 })], "cs");
  assert.equal(
    line,
    "Nejlepší nedávné posty (reálná čísla): Facebook „Tohle je hodně dlouhý popisek, který se do jedné řádky groun…“ — dosah 9, reakce 1, komentáře 0."
  );
});

test("a post with no row is simply absent — it is never quoted as a zero", () => {
  const line = socialPerformanceLines(POSTS, ROWS, "cs");
  assert.equal(line.includes("nikdo nezměřil"), false);
});

test("the line quotes at most SOCIAL_PERFORMANCE_TOP_N posts", () => {
  const many = Array.from({ length: 10 }, (_, i) => post(`m${i}`, "facebook", `post ${i}`));
  const rows = many.map((p, i) => row(p.id, "2026-08-30", { reach: 1000 - i }));
  const line = socialPerformanceLines(many, rows, "cs");
  assert.equal(line.split(";").length, SOCIAL_PERFORMANCE_TOP_N);
});

// ── the grounding resolver (the seam the AI route concatenates) ───────────────

test("an anonymous/demo caller gets \"\" — never another tenant's numbers", async () => {
  const { socialPerformanceGrounding } = await import("@/lib/social/performance-grounding");
  assert.equal(await socialPerformanceGrounding(null, "p-any", "cs"), "");
});

test("a project with posts but NO measured rows grounds to \"\" (absence is not zero)", async () => {
  const { socialPerformanceGrounding } = await import("@/lib/social/performance-grounding");
  const { createPost } = await import("@/lib/social/store");
  const { resolveTenant } = await import("@/lib/campaigns/connector");
  const tenant = await resolveTenant("u-ground", "p-ground", { accountScoped: false });
  await createPost(tenant, { platform: "facebook", content: "Nezměřený příspěvek", status: "published" });
  assert.equal(await socialPerformanceGrounding("u-ground", "p-ground", "cs"), "");
});

test("with real rows the resolver produces the real line, from the store end to end", async () => {
  const { socialPerformanceGrounding } = await import("@/lib/social/performance-grounding");
  const { createPost } = await import("@/lib/social/store");
  const { resolveTenant } = await import("@/lib/campaigns/connector");
  const tenant = await resolveTenant("u-ground2", "p-ground2", { accountScoped: false });
  const created = await createPost(tenant, {
    platform: "instagram",
    content: "Krátké video z pražírny",
    status: "published",
  });
  const today = metricDay(new Date());
  await upsertSocialMetricDay({ postId: created.id, day: today, tenant, reach: 4200, likes: 310, comments: 44 });
  assert.equal(
    await socialPerformanceGrounding("u-ground2", "p-ground2", "cs"),
    "Nejlepší nedávné posty (reálná čísla): Instagram „Krátké video z pražírny“ — dosah 4200, reakce 310, komentáře 44."
  );
});

// ── the ledger step ───────────────────────────────────────────────────────────

test("the step is registered exactly once in LEDGER_STEPS", () => {
  const found = LEDGER_STEPS.filter((s) => s.id === SOCIAL_READBACK_STEP_ID);
  assert.equal(found.length, 1);
  assert.equal(found[0], socialReadbackStep);
});

test("the due-gate is at most once per six hours, and a never-run step is due", () => {
  const now = new Date("2026-08-30T12:00:00.000Z");
  assert.equal(socialReadbackStep.due(now, null), true);
  assert.equal(
    socialReadbackStep.due(now, new Date(now.getTime() - SOCIAL_READBACK_INTERVAL_MS + 60_000).toISOString()),
    false
  );
  assert.equal(
    socialReadbackStep.due(now, new Date(now.getTime() - SOCIAL_READBACK_INTERVAL_MS).toISOString()),
    true
  );
});

test("an unreadable lastRunAt makes the step due — a bad stamp must not wedge it forever", () => {
  assert.equal(socialReadbackStep.due(new Date(), "not-a-date"), true);
});

test("ACCEPTANCE — with no provider configured the step does NO work and says so", async () => {
  const res = await runSocialReadback(new Date("2026-08-30T12:00:00.000Z"));
  assert.equal(res.ok, true);
  assert.deepEqual(res.counts, { accounts: 0, posts: 0, updated: 0, failed: 0, pruned: 0 });
  // Honest zero-work means it did not even prune — nothing was read, so nothing was
  // aged out behind the operator's back.
  assert.equal(res.counts.pruned, 0);
});
