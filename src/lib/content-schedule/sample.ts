/** Illustrative Google Business Profile post board for a local-SEO project — a
 *  baseline content schedule: post ideas drawn from the service catalog × the
 *  project's localities, some already scheduled/published across a 4-week window.
 *  Seeded off the project id so it stays stable and varies per project. Real seam:
 *  the GBP posting API + the content engine's AI drafting. Framework-free. */
import type { Project } from "@/lib/projects/types";
import type { Locality, ServiceOffering } from "@/lib/catalog/offering";
import { seed01 } from "@/lib/project-data/seed";

export type PostStatus = "idea" | "scheduled" | "published";

export interface ContentPost {
  id: string;
  title: string;
  service: string;
  area: string;
  status: PostStatus;
  /** day index 0–27 in the 4-week window (day 0 = the window start), counting
   *  forward; null while still an idea. Published posts sit in the past half of the
   *  window, scheduled posts ahead of them — so the board reads chronologically. */
  day: number | null;
  /** AI-drafted GBP post copy (grounded on the service via the social tool). Absent
   *  until the maker drafts it; persisted with the board so it survives a reload. */
  body?: string;
}

/** GBP-post idea templates ({service}/{area} are filled from the catalog). */
const IDEA_TEMPLATES = [
  "Nabídka: {service} v {area}",
  "Tip: jak vybrat {service}",
  "Novinka v {area}: {service}",
  "Spokojený zákazník — {service}",
  "Akce tento týden: {service}",
  "Časté dotazy: {service}",
];

/** The window is 4 weeks × 7 days. */
export const WINDOW_DAYS = 28;

/** Build the initial post board from the service catalog × localities. Some posts
 *  are still ideas (unscheduled), others are scheduled/published across the window. */
export function initialPosts(
  project: Project,
  services: ServiceOffering[],
  localities: Locality[],
  limit = 12
): ContentPost[] {
  const byId = new Map(localities.map((l) => [l.id, l]));
  const combos: { service: string; area: string; key: string }[] = [];
  for (const s of services) {
    for (const areaId of s.serviceAreas) {
      const loc = byId.get(areaId);
      if (loc) combos.push({ service: s.name, area: loc.name, key: `${s.name}:${areaId}` });
    }
  }
  return combos.slice(0, limit).map((c, i) => {
    const g = (k: string) => seed01(`${project.id}:post:${c.key}:${k}`);
    const tpl = IDEA_TEMPLATES[Math.floor(g("tpl") * IDEA_TEMPLATES.length)];
    const title = tpl.replace("{service}", c.service).replace("{area}", c.area);
    const roll = g("status");
    const status: PostStatus = roll > 0.6 ? "idea" : roll > 0.3 ? "scheduled" : "published";
    // Anchor day meaning: published posts land in the first (past) half of the
    // window, scheduled posts in the second (upcoming) half — never a "published"
    // item dated after a "scheduled" one, which read as a bug on the demo board.
    const half = Math.floor(WINDOW_DAYS / 2);
    const day =
      status === "idea"
        ? null
        : status === "published"
          ? Math.floor(g("day") * half)
          : half + Math.floor(g("day") * (WINDOW_DAYS - half));
    return { id: `post-${i}`, title, service: c.service, area: c.area, status, day };
  });
}
