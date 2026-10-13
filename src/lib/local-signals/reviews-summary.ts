/** Room summary for Recenze on the Local roof (ADR-0013): the average rating of
 *  the active review set and how many reviews arrived in the last 30 days. */
import "server-only";
import { resolveReviews } from "./resolve";
import { reviewsForProject } from "@/lib/reviews/sample";
import { localitiesFor } from "@/lib/catalog/resolve";
import { count, say, type Summarizer } from "@/lib/projects/roof";

const summarize: Summarizer = async ({ project, locale }) => {
  const r = await resolveReviews(project.id, reviewsForProject(project, localitiesFor(project)));
  if (r.reviews.length === 0) return { status: "empty" };
  const avg = r.reviews.reduce((s, x) => s + x.rating, 0) / r.reviews.length;
  const recent = r.reviews.filter((x) => x.daysAgo <= 30).length;
  return {
    status: avg >= 4.5 ? "ok" : "attention",
    metric: { label: say(locale, "Průměrné hodnocení", "Average rating"), value: `${avg.toFixed(1)} ★` },
    note: say(locale, `${count(locale, recent)} za posledních 30 dní.`, `${count(locale, recent)} in the last 30 days.`),
    source: r.live ? "live" : "sample",
  };
};
export default summarize;
