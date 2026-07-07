/** Content-schedule rollups + calendar layout. Pure (framework-free), tested. */
import type { ContentPost } from "./sample";
import { WINDOW_DAYS } from "./sample";

export interface StatusCounts {
  idea: number;
  scheduled: number;
  published: number;
}

export function statusCounts(posts: ContentPost[]): StatusCounts {
  const c: StatusCounts = { idea: 0, scheduled: 0, published: 0 };
  for (const p of posts) c[p.status]++;
  return c;
}

/** Posts still unscheduled (the idea queue), in input order. */
export function ideas(posts: ContentPost[]): ContentPost[] {
  return posts.filter((p) => p.status === "idea");
}

/** Lay scheduled/published posts into a 28-cell calendar (index = day). Ideas
 *  (day === null) are excluded. Cell order preserves input order. */
export function calendarGrid(posts: ContentPost[]): ContentPost[][] {
  const cells: ContentPost[][] = Array.from({ length: WINDOW_DAYS }, () => []);
  for (const p of posts) {
    if (p.day !== null && p.day >= 0 && p.day < WINDOW_DAYS) cells[p.day].push(p);
  }
  return cells;
}

/** First day (0–27) holding fewer than `capacity` posts — where the next idea
 *  drops when scheduled. Returns the last day if the window is full. */
export function nextFreeDay(posts: ContentPost[], capacity = 2): number {
  const grid = calendarGrid(posts);
  for (let d = 0; d < WINDOW_DAYS; d++) {
    if (grid[d].length < capacity) return d;
  }
  return WINDOW_DAYS - 1;
}
