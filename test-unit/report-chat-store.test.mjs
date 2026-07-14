/** Unit tests for the Datový report chat's pure helpers (report-chat "grows a
 *  memory and tells the truth"): period validation from the dashboard link, and the
 *  conversation persistence shape — defensive parse, the message cap, the settled
 *  guard and the per-bucket key. Storage I/O and React effects stay in the hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REPORT_MESSAGES,
  capMessages,
  isSettled,
  parseStoredMessages,
  reportChatKey,
  serializeMessages,
  validateReportPeriod,
} from "@/components/dashboard/report-chat-store";

test("validateReportPeriod accepts the known report keys", () => {
  assert.equal(validateReportPeriod("30d"), "30d");
  assert.equal(validateReportPeriod("90d"), "90d");
  assert.equal(validateReportPeriod("12m"), "12m");
});

test("validateReportPeriod falls back to 90d for unknown / missing / garbage", () => {
  // 7d is a dashboard window the report doesn't offer → falls back
  assert.equal(validateReportPeriod("7d"), "90d");
  assert.equal(validateReportPeriod(undefined), "90d");
  assert.equal(validateReportPeriod(""), "90d");
  assert.equal(validateReportPeriod("nonsense"), "90d");
  assert.equal(validateReportPeriod("90D"), "90d"); // case-sensitive by design
});

test("validateReportPeriod takes the first entry of a repeated query param", () => {
  assert.equal(validateReportPeriod(["30d", "12m"]), "30d");
  assert.equal(validateReportPeriod(["bogus", "90d"]), "90d");
  assert.equal(validateReportPeriod([]), "90d");
});

test("reportChatKey scopes storage per bucket and mirrors the app: convention", () => {
  assert.equal(reportChatKey("proj_123"), "app:report-chat:proj_123");
  assert.notEqual(reportChatKey("proj_123"), reportChatKey("demo"));
  assert.match(reportChatKey("demo"), /^app:/);
});

test("capMessages keeps only the last MAX_REPORT_MESSAGES turns (tail)", () => {
  const many = Array.from({ length: MAX_REPORT_MESSAGES + 12 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `m${i}`,
  }));
  const capped = capMessages(many);
  assert.equal(capped.length, MAX_REPORT_MESSAGES);
  // the tail is preserved (the oldest are dropped)
  assert.equal(capped.at(-1).content, `m${many.length - 1}`);
  assert.equal(capped[0].content, `m${many.length - MAX_REPORT_MESSAGES}`);
});

test("capMessages leaves a short transcript untouched", () => {
  const few = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
  ];
  assert.deepEqual(capMessages(few), few);
});

test("parseStoredMessages round-trips a valid transcript and strips extra keys", () => {
  const stored = serializeMessages([
    { role: "user", content: "Proč roste PNO?" },
    { role: "assistant", content: "Protože…" },
  ]);
  assert.deepEqual(parseStoredMessages(stored), [
    { role: "user", content: "Proč roste PNO?" },
    { role: "assistant", content: "Protože…" },
  ]);
  // an entry carrying junk fields is normalised to just role + content
  const dirty = JSON.stringify([{ role: "user", content: "hi", ts: 1, extra: {} }]);
  assert.deepEqual(parseStoredMessages(dirty), [{ role: "user", content: "hi" }]);
});

test("parseStoredMessages rejects garbage, non-arrays and malformed turns", () => {
  assert.deepEqual(parseStoredMessages(null), []);
  assert.deepEqual(parseStoredMessages(""), []);
  assert.deepEqual(parseStoredMessages("not json"), []);
  assert.deepEqual(parseStoredMessages("42"), []);
  assert.deepEqual(parseStoredMessages(JSON.stringify({ role: "user", content: "x" })), []);
  // malformed turns are filtered out, valid ones survive
  const mixed = JSON.stringify([
    { role: "user", content: "ok" },
    { role: "system", content: "nope" }, // unsupported role
    { role: "assistant", content: 42 }, // non-string content
    { content: "no role" },
    null,
    "string",
  ]);
  assert.deepEqual(parseStoredMessages(mixed), [{ role: "user", content: "ok" }]);
});

test("parseStoredMessages caps an oversized stored transcript on read", () => {
  const many = Array.from({ length: MAX_REPORT_MESSAGES + 5 }, (_, i) => ({
    role: "user",
    content: `m${i}`,
  }));
  const parsed = parseStoredMessages(JSON.stringify(many));
  assert.equal(parsed.length, MAX_REPORT_MESSAGES);
  assert.equal(parsed.at(-1).content, `m${many.length - 1}`);
});

test("serializeMessages caps before writing", () => {
  const many = Array.from({ length: MAX_REPORT_MESSAGES + 8 }, (_, i) => ({
    role: "assistant",
    content: `m${i}`,
  }));
  assert.equal(JSON.parse(serializeMessages(many)).length, MAX_REPORT_MESSAGES);
});

test("isSettled is true only for empty or assistant-terminated transcripts", () => {
  assert.equal(isSettled([]), true);
  assert.equal(isSettled([{ role: "user", content: "q" }]), false); // dangling question
  assert.equal(
    isSettled([
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
    ]),
    true
  );
});
