/** Direction 2 — the GAQL date window respects the account's clock. The pure tz-day
 *  primitives behind dateRange (src/lib/google/ads.ts): todayInTimeZone (today in an
 *  IANA zone, UTC fallback) and shiftCalendarDays (calendar subtraction, DST-safe).
 *  Google Ads segments.date is account-local, so a UTC "today" misaligns the edge days
 *  for a non-UTC account — these functions align them. ads.ts imports only
 *  campaigns/types (framework-free), so it imports cleanly under react-server. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { todayInTimeZone, shiftCalendarDays } = await import("@/lib/google/ads");

test("todayInTimeZone: UTC+14 (Kiritimati) can already be on the NEXT calendar day", () => {
  // 2026-01-01T11:00Z → 2026-01-02 01:00 in Pacific/Kiritimati (+14): tomorrow locally.
  const instant = new Date("2026-01-01T11:00:00Z");
  assert.equal(todayInTimeZone("Pacific/Kiritimati", instant), "2026-01-02");
  // Same instant is still 2026-01-01 in UTC.
  assert.equal(todayInTimeZone(undefined, instant), "2026-01-01");
});

test("todayInTimeZone: UTC-11 (Pago Pago) can still be on the PREVIOUS calendar day", () => {
  // 2026-01-01T05:00Z → 2025-12-31 18:00 in Pacific/Pago_Pago (-11): yesterday locally.
  const instant = new Date("2026-01-01T05:00:00Z");
  assert.equal(todayInTimeZone("Pacific/Pago_Pago", instant), "2025-12-31");
  assert.equal(todayInTimeZone(undefined, instant), "2026-01-01");
});

test("todayInTimeZone: Europe/Prague matches UTC by day except the late-UTC edge", () => {
  // Mid-day UTC: same calendar day as Prague (UTC+1 winter / +2 summer).
  assert.equal(todayInTimeZone("Europe/Prague", new Date("2026-06-15T09:00:00Z")), "2026-06-15");
  // Late UTC evening: Prague has already rolled to the next day (23:00Z = 01:00 CEST).
  assert.equal(todayInTimeZone("Europe/Prague", new Date("2026-06-15T23:00:00Z")), "2026-06-16");
});

test("todayInTimeZone: absent or invalid zone falls back to UTC (byte-identical to old)", () => {
  const instant = new Date("2026-03-09T15:30:45Z");
  const utc = instant.toISOString().slice(0, 10);
  assert.equal(todayInTimeZone(undefined, instant), utc);
  assert.equal(todayInTimeZone(null, instant), utc);
  assert.equal(todayInTimeZone("", instant), utc);
  // A garbage zone string must not throw — it degrades to UTC.
  assert.equal(todayInTimeZone("Not/AZone", instant), utc);
});

test("shiftCalendarDays: plain trailing-window subtraction", () => {
  assert.equal(shiftCalendarDays("2026-06-15", 30), "2026-05-16");
  assert.equal(shiftCalendarDays("2026-06-15", 0), "2026-06-15");
  assert.equal(shiftCalendarDays("2026-01-01", 1), "2025-12-31"); // year boundary
});

test("shiftCalendarDays: DST-safe — spans a spring-forward transition without drift", () => {
  // US DST 2026 begins 2026-03-08. Subtracting across it stays on exact calendar days
  // (the helper is pure UTC-midnight epoch math, immune to wall-clock DST shifts).
  assert.equal(shiftCalendarDays("2026-03-10", 5), "2026-03-05");
  // Prague DST begins 2026-03-29; 400-day report window across two DST transitions.
  assert.equal(shiftCalendarDays("2026-07-15", 400), "2025-06-10");
});

test("shiftCalendarDays composes with todayInTimeZone to a consistent window", () => {
  // The account-local end date drives a start that is exactly `days` before it — the
  // same relationship dateRange relies on, verified end-to-end through both helpers.
  const end = todayInTimeZone("Pacific/Kiritimati", new Date("2026-01-01T11:00:00Z"));
  assert.equal(end, "2026-01-02");
  assert.equal(shiftCalendarDays(end, 90), "2025-10-04");
});
