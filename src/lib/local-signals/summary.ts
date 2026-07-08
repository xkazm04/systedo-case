/** R06 grounding appendix for a `local` project's monthly recap: the two signals a
 *  local-SEO client actually lives in — map-pack coverage (how many service×area
 *  combos rank in the top-3, average position) and review sentiment (count, average
 *  stars, positive/negative split). Without this the recap grounded a local business
 *  in lead-quality alone and never mentioned its map rank or reviews (UAT-L1-11 local
 *  half / R06). Rides on the recap's USER prompt only — the system+schema fingerprint
 *  is unchanged. Resolves the LIVE ladder when synced, else the honest sample.
 *  Null for non-local projects. */
import type { Project } from "@/lib/projects/types";
import type { SupportedLocale } from "@/lib/format";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";
import { keywordLadder } from "@/lib/mappack/sample";
import { resolveLocalLadder } from "@/lib/local-signals/resolve";
import { reviewsForProject } from "@/lib/reviews/sample";
import { bandOf } from "@/lib/reviews/compute";
import { fmtInt, fmtPct } from "@/lib/format";

export async function localSignalsPromptText(
  project: Project,
  locale: SupportedLocale = "cs"
): Promise<string | null> {
  if (project.type !== "local") return null;

  const localities = localitiesFor(project);
  const services = await loadServicesFor(project);
  const resolved = await resolveLocalLadder(project.id, keywordLadder(project, localities, services));
  const ladder = resolved.ladder;
  const reviews = reviewsForProject(project, localities);
  if (ladder.length === 0 && reviews.length === 0) return null;

  // Map-pack coverage — current position per tracked service×area combo.
  const tracked = ladder.length;
  const inPack = ladder.filter((r) => r.current <= 3).length;
  const top1 = ladder.filter((r) => r.current === 1).length;
  const avgRank = tracked > 0 ? ladder.reduce((a, r) => a + r.current, 0) / tracked : 0;
  const packRate = tracked > 0 ? inPack / tracked : 0;

  // Review sentiment.
  const n = reviews.length;
  const avgStars = n > 0 ? reviews.reduce((a, r) => a + r.rating, 0) / n : 0;
  let pos = 0;
  let neg = 0;
  for (const r of reviews) {
    const b = bandOf(r.rating);
    if (b === "positive") pos++;
    else if (b === "negative") neg++;
  }

  const cs = locale !== "en";
  const lines: string[] = [];
  if (cs) {
    lines.push("Lokální viditelnost (reálná, spočítaná data — report na ně nesmí mlčet):");
    if (tracked > 0) {
      lines.push(
        `- Mapa-pack: sledováno ${fmtInt(tracked)} kombinací služba×lokalita; v top 3 ${fmtInt(inPack)} (${fmtPct(
          packRate,
          0
        )}), z toho na 1. místě ${fmtInt(top1)}; průměrná pozice ${avgRank.toFixed(1)}.`
      );
    }
    if (n > 0) {
      lines.push(
        `- Recenze: ${fmtInt(n)} hodnocení, průměr ${avgStars.toFixed(1)}★; pozitivních ${fmtInt(
          pos
        )}, negativních ${fmtInt(neg)}.`
      );
    }
  } else {
    lines.push("Local visibility (real, already-computed data — the report must not stay silent on it):");
    if (tracked > 0) {
      lines.push(
        `- Map pack: ${fmtInt(tracked)} service×area combos tracked; top-3 for ${fmtInt(inPack)} (${fmtPct(
          packRate,
          0
        )}), of which #1 for ${fmtInt(top1)}; average position ${avgRank.toFixed(1)}.`
      );
    }
    if (n > 0) {
      lines.push(
        `- Reviews: ${fmtInt(n)} ratings, ${avgStars.toFixed(1)}★ average; ${fmtInt(pos)} positive, ${fmtInt(
          neg
        )} negative.`
      );
    }
  }
  return lines.length > 1 ? lines.join("\n") : null;
}
