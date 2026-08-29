/** W2-C — server-side grounding for the `local-page` tool (and for the publish
 *  route, which re-derives the same facts rather than trusting the wire).
 *
 *  The caller names WHICH coverage gap to write about; every FIGURE and every quoted
 *  review is rebuilt here from the owned project — the catalog's own service name,
 *  price and price model, the business type derived from the catalogue, the shared
 *  brand fact block, and at most two REAL reviews from that area. A tampered body can
 *  therefore not put an invented price or a fabricated testimonial onto a public,
 *  indexable page.
 *
 *  Two honesty rules are enforced here rather than in the prompt:
 *   - Reviews are quoted ONLY when the project's review set is genuinely imported.
 *     The illustrative sample reviews are demo prose; publishing one as a customer
 *     testimonial at a public URL would be fabrication, not a disclosure problem.
 *   - `sample` is true when the catalog itself is the seed, so the prompt hedges
 *     instead of writing a seeded price up as a fact.
 *
 *  Tenancy is the same demo-public / owner-only triad the /api/ai grounding resolvers
 *  use, resolved here because this module is imported from BOTH the mode table and the
 *  publish route. Server-only. */
import "server-only";
import type { LocalPageRequest, LocalPageReviewQuote } from "@/lib/ai-types";
import type { Project } from "@/lib/projects/types";
import { getProject } from "@/lib/projects/store";
import { isDemoProjectId } from "@/lib/projects/demo";
import { demoProjectById } from "@/lib/demo/projects";
import { promptSafeName } from "@/lib/projects/name";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadProjectCatalogWithSource } from "@/lib/catalog/load";
import { isService } from "@/lib/catalog/offering";
import { businessTypeFromServices } from "@/lib/local/business-type";
import { deriveBrandContext } from "@/lib/brand/context";
import { reviewsForProject } from "@/lib/reviews/sample";
import { resolveReviews } from "./resolve";
import { coverageKey } from "./import";

/** At most two quotes reach the prompt — enough to sound grounded, few enough that
 *  the page cannot become a wall of borrowed voice. */
export const MAX_PAGE_REVIEWS = 2;

export interface ResolvedLocalPage {
  request: LocalPageRequest;
  /** true when the grounding rests on the illustrative catalog seed */
  sample: boolean;
  /** the effective cache-tenancy key (the project the grounding was read for) */
  keyId: string;
}

/** The demo-public / owner-only project triad. A demo id is public (fixture only,
 *  never a tenant read); a real id must belong to the caller. */
async function accessProject(
  projectId: string | undefined,
  userId: string | null
): Promise<Project | null> {
  if (!projectId) return null;
  if (isDemoProjectId(projectId)) return demoProjectById(projectId) ?? null;
  if (!userId) return null;
  return getProject(userId, projectId);
}

/** Case/diacritic-insensitive equality on the SAME fold the coverage overlay uses,
 *  so "Montaz klimatizaci" from a client picks out "Montáž klimatizací" in the
 *  catalog — and the published page's stored `service` then folds back onto the very
 *  cell it was published for. */
function sameLabel(a: string, b: string): boolean {
  return coverageKey(a, "") === coverageKey(b, "");
}

/** Build the grounded request for ONE service×area page from an already-resolved
 *  project. Exported for the unit tests and any batch caller; the tenancy check lives
 *  in {@link resolveLocalPage}. */
export async function buildLocalPageRequest(
  project: Project,
  service: string,
  area: string
): Promise<ResolvedLocalPage> {
  const localities = localitiesFor(project);
  const [{ offerings, source }, resolvedReviews] = await Promise.all([
    loadProjectCatalogWithSource(project),
    resolveReviews(project.id, reviewsForProject(project, localities)),
  ]);

  const services = offerings.filter(isService);
  // Prefer the catalog's own spelling of the service — the stored payload then folds
  // back onto the coverage cell even when the caller typed it without diacritics.
  const matched = services.find((s) => sameLabel(s.name, service));
  const areaMatched = localities.find((l) => sameLabel(l.name, area));

  const brand = promptSafeName(project.name) || project.name;
  const request: LocalPageRequest = {
    service: matched?.name ?? service,
    area: areaMatched?.name ?? area,
    businessType: businessTypeFromServices(services) ?? "",
    brand,
  };
  if (matched) {
    if (matched.price > 0) request.price = matched.price;
    request.priceModel = matched.priceModel;
    if (matched.currency) request.currency = matched.currency;
  }
  const brandContext = deriveBrandContext(project, offerings);
  if (brandContext) request.brandContext = brandContext;

  // ONLY genuinely imported reviews may be quoted on a public page (see the header).
  if (resolvedReviews.live) {
    const quotes: LocalPageReviewQuote[] = resolvedReviews.reviews
      .filter((r) => sameLabel(r.area, request.area) && r.text.trim().length > 0)
      .sort((a, b) => b.rating - a.rating || a.daysAgo - b.daysAgo)
      .slice(0, MAX_PAGE_REVIEWS)
      .map((r) => ({ author: r.author, rating: r.rating, text: r.text }));
    if (quotes.length > 0) request.reviews = quotes;
  }

  return { request, sample: source === "sample", keyId: project.id };
}

/** The `local-page` mode's grounding resolver: resolve the project for the caller,
 *  then rebuild the request from it. `null` when no project resolves (an unowned or
 *  unknown id) — the mode then returns the shared "nothing to write about" 422. */
export async function resolveLocalPage(
  projectId: string | undefined,
  userId: string | null,
  service: string,
  area: string
): Promise<ResolvedLocalPage | null> {
  const project = await accessProject(projectId, userId);
  if (!project) return null;
  if (!service.trim() || !area.trim()) return null;
  return buildLocalPageRequest(project, service, area);
}
