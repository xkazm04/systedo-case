/** Journey memory for the case-study walk-through (nav-header-footer #4).
 *  TaskPager's JourneyBeacon records which journey pages the reviewer has seen
 *  (localStorage, same persistence pattern as the theme choice); the mobile
 *  menu reads it to render visited checkmarks and a one-tap "Pokračovat" resume
 *  link to the first unvisited task. Framework-free — storage is injected so
 *  the helpers stay pure and unit-testable (test-unit/journey.test.mjs). */
import type { NavItem } from "@/lib/nav";

export const JOURNEY_VISITED_KEY = "systedo.journey.visited";
export const JOURNEY_LAST_KEY = "systedo.journey.last";

/** The subset of the Storage interface the helpers need (injectable in tests). */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Parse the stored visited list defensively — anything but an array of
 *  strings degrades to "nothing visited". */
export function parseVisited(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Read the visited hrefs; never throws (storage quirks degrade to []). */
export function readVisited(storage: StorageLike): string[] {
  try {
    return parseVisited(storage.getItem(JOURNEY_VISITED_KEY));
  } catch {
    return [];
  }
}

/** Append a page to the visited set (idempotent) and remember it as the last
 *  stop. Returns the updated list; never throws. */
export function markVisited(storage: StorageLike, href: string): string[] {
  const visited = readVisited(storage);
  if (!visited.includes(href)) visited.push(href);
  try {
    storage.setItem(JOURNEY_VISITED_KEY, JSON.stringify(visited));
    storage.setItem(JOURNEY_LAST_KEY, href);
  } catch {
    /* private mode / quota — the in-memory list still serves this session */
  }
  return visited;
}

/** The first task page (task > 0, in task order) the reviewer hasn't seen yet —
 *  the "Pokračovat" target. Null when the journey is complete (or empty). */
export function firstUnvisited(items: NavItem[], visited: string[]): NavItem | null {
  const tasks = [...items].filter((i) => i.task > 0).sort((a, b) => a.task - b.task);
  return tasks.find((i) => !visited.includes(i.href)) ?? null;
}
