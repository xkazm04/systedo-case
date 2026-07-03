/** Unit tests for the journey-memory helpers (nav-header-footer #4): defensive
 *  parsing, idempotent visit recording against an injected storage, and the
 *  "first unvisited task" resume target. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstUnvisited,
  JOURNEY_LAST_KEY,
  JOURNEY_VISITED_KEY,
  markVisited,
  parseVisited,
  readVisited,
} from "@/lib/journey";

/** Minimal in-memory Storage stand-in. */
const memStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
  };
};

const ITEMS = [
  { href: "/", label: "Přehled", blurb: "", task: 0 },
  { href: "/dashboard", label: "Dashboard", blurb: "", task: 1 },
  { href: "/clanek", label: "Článek", blurb: "", task: 2 },
  { href: "/ai-asistent", label: "AI asistent", blurb: "", task: 3 },
];

test("parseVisited degrades garbage to an empty list", () => {
  assert.deepEqual(parseVisited(null), []);
  assert.deepEqual(parseVisited("not json"), []);
  assert.deepEqual(parseVisited('{"a":1}'), []);
  assert.deepEqual(parseVisited('["a", 2, "b"]'), ["a", "b"]);
});

test("markVisited appends once (idempotent) and records the last stop", () => {
  const storage = memStorage();
  markVisited(storage, "/dashboard");
  markVisited(storage, "/clanek");
  markVisited(storage, "/dashboard");
  assert.deepEqual(readVisited(storage), ["/dashboard", "/clanek"]);
  // the last stop follows every visit, including a re-visit
  assert.equal(storage.getItem(JOURNEY_LAST_KEY), "/dashboard");
  assert.equal(JSON.parse(storage.getItem(JOURNEY_VISITED_KEY)).length, 2);
});

test("readVisited never throws on a hostile storage", () => {
  const throwing = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  assert.deepEqual(readVisited(throwing), []);
  assert.deepEqual(markVisited(throwing, "/x"), ["/x"]);
});

test("firstUnvisited walks tasks in order, skips the overview and returns null when done", () => {
  assert.equal(firstUnvisited(ITEMS, [])?.href, "/dashboard");
  assert.equal(firstUnvisited(ITEMS, ["/dashboard"])?.href, "/clanek");
  // the overview (task 0) never counts as a resume target
  assert.equal(firstUnvisited(ITEMS, ["/"])?.href, "/dashboard");
  assert.equal(firstUnvisited(ITEMS, ["/dashboard", "/clanek", "/ai-asistent"]), null);
});
