/** Feedback intake core (src/lib/feedback/submit.ts + types.ts): the injected-
 *  deps flow behind POST /api/feedback. Pins the sanitizer bounds, the actor-key
 *  rate limiting (user id when authed, client IP when anonymous), persistence
 *  as the hard failure vs the email as best-effort, and the HTML-escaping of
 *  user-supplied text in the support mail. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFeedbackInput } from "@/lib/feedback/types";
import { FEEDBACK_RATE, feedbackEmailHtml, submitFeedback } from "@/lib/feedback/submit";

// --- sanitizer ---------------------------------------------------------------

test("sanitize: message required (3..2000), email optional but shape-checked", () => {
  assert.deepEqual(sanitizeFeedbackInput(null), { ok: false, code: "unprocessable" });
  assert.deepEqual(sanitizeFeedbackInput({ message: "ab" }), { ok: false, code: "empty-content" });
  assert.deepEqual(sanitizeFeedbackInput({ message: "x".repeat(2001) }), {
    ok: false,
    code: "content-too-long",
  });
  assert.deepEqual(sanitizeFeedbackInput({ message: "Dobrý nástroj!", email: "not-an-email" }), {
    ok: false,
    code: "unprocessable",
  });
  const ok = sanitizeFeedbackInput({
    message: "  Dobrý nástroj!  ",
    email: "a@b.cz",
    source: "demo",
    path: "/dashboard",
  });
  assert.deepEqual(ok, {
    ok: true,
    message: "Dobrý nástroj!",
    email: "a@b.cz",
    source: "demo",
    path: "/dashboard",
  });
});

test("sanitize: unknown source coerces to 'app'; empty email is simply absent", () => {
  const r = sanitizeFeedbackInput({ message: "abc", source: "evil", email: "  " });
  assert.ok(r.ok);
  assert.equal(r.source, "app");
  assert.equal(r.email, undefined);
});

// --- the injected flow -------------------------------------------------------

const okDeps = (over = {}) => {
  const calls = { rate: [], added: [], mails: [] };
  const deps = {
    rateLimit: (actorKey, rules) => {
      calls.rate.push({ actorKey, buckets: rules.map((r) => r.bucket) });
      return { ok: true, retryAfter: 0 };
    },
    addFeedback: async (entry) => {
      calls.added.push(entry);
    },
    sendEmail: async (to, subject, html) => {
      calls.mails.push({ to, subject, html });
      return true;
    },
    uuid: () => "fixture-id",
    now: () => new Date("2026-08-04T10:00:00.000Z"),
    ...over,
  };
  return { deps, calls };
};

test("authed submit: rate-keyed by user id, persists with userId, mails support", async () => {
  const { deps, calls } = okDeps();
  const res = await submitFeedback(deps, {
    body: { message: "Chybí mi export do CSV.", source: "app", path: "/app/p1/katalog" },
    userId: "user-1",
    ip: "1.2.3.4",
  });
  assert.deepEqual(res, { status: 201 });
  assert.equal(calls.rate[0].actorKey, "user:user-1");
  assert.deepEqual(calls.rate[0].buckets, ["feedback:min", "feedback:day"]);
  const entry = calls.added[0];
  assert.equal(entry.userId, "user-1");
  assert.equal(entry.id, "fixture-id");
  assert.equal(entry.at, "2026-08-04T10:00:00.000Z");
  assert.equal(calls.mails.length, 1);
  assert.match(calls.mails[0].to, /@/);
});

test("anonymous submit: rate-keyed by IP, no userId, optional email persisted", async () => {
  const { deps, calls } = okDeps();
  const res = await submitFeedback(deps, {
    body: { message: "Pěkné demo!", email: "visitor@example.com", source: "demo" },
    userId: null,
    ip: "5.6.7.8",
  });
  assert.deepEqual(res, { status: 201 });
  assert.equal(calls.rate[0].actorKey, "5.6.7.8");
  assert.equal(calls.added[0].userId, undefined);
  assert.equal(calls.added[0].email, "visitor@example.com");
});

test("rate-limited: 429 with retryAfter, nothing persisted or mailed", async () => {
  const { deps, calls } = okDeps({ rateLimit: () => ({ ok: false, retryAfter: 42 }) });
  const res = await submitFeedback(deps, { body: { message: "spam" }, userId: null, ip: "x" });
  assert.deepEqual(res, { status: 429, retryAfter: 42 });
  assert.equal(calls.added.length, 0);
  assert.equal(calls.mails.length, 0);
});

test("invalid body: 422 with the sanitizer's code, nothing persisted", async () => {
  const { deps, calls } = okDeps();
  const res = await submitFeedback(deps, { body: { message: "" }, userId: null, ip: "x" });
  assert.deepEqual(res, { status: 422, code: "empty-content" });
  assert.equal(calls.added.length, 0);
});

test("persist failure is a real 500 (the submission would be lost); no mail", async () => {
  const { deps, calls } = okDeps({
    addFeedback: async () => {
      throw new Error("store down");
    },
  });
  const res = await submitFeedback(deps, { body: { message: "abc" }, userId: null, ip: "x" });
  assert.deepEqual(res, { status: 500 });
  assert.equal(calls.mails.length, 0, "no mail for a submission that was not stored");
});

test("email failure does NOT fail the submit (best-effort by contract)", async () => {
  const { deps } = okDeps({ sendEmail: async () => false });
  const res = await submitFeedback(deps, { body: { message: "abc" }, userId: null, ip: "x" });
  assert.deepEqual(res, { status: 201 });
});

// --- support mail safety + rate rules ----------------------------------------

test("support mail HTML-escapes user-supplied text", () => {
  const html = feedbackEmailHtml({
    id: "i",
    message: '<script>alert("x")</script>',
    email: "a@b.cz",
    source: "demo",
    at: "2026-08-04T10:00:00.000Z",
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("FEEDBACK_RATE: env-tunable caps, distinct buckets, sane defaults", () => {
  delete process.env.FEEDBACK_PER_MIN;
  delete process.env.FEEDBACK_PER_DAY;
  assert.equal(FEEDBACK_RATE.perMin().limit, 3);
  assert.equal(FEEDBACK_RATE.perDay().limit, 20);
  assert.notEqual(FEEDBACK_RATE.perMin().bucket, FEEDBACK_RATE.perDay().bucket);
  process.env.FEEDBACK_PER_MIN = "7";
  assert.equal(FEEDBACK_RATE.perMin().limit, 7);
  delete process.env.FEEDBACK_PER_MIN;
});
