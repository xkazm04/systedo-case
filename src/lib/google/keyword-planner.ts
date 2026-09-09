/** Google Ads Keyword Planner client (REST, server-only, dependency-free). Calls
 *  KeywordPlanIdeaService.generateKeywordIdeas on behalf of the signed-in user
 *  (their OAuth token + the app's developer token) and maps the result into the
 *  framework-free RawKeywordIdea model. Requires GOOGLE_ADS_DEVELOPER_TOKEN;
 *  without it the engine stays on sample data and this is never called. */
import "server-only";
import type { Competition, RawKeywordIdea } from "@/lib/keywords/types";
// Same API, same credentials as the campaigns client — share its header builder
// rather than keeping a second copy that can drift out of lockstep with it.
import { ADS_API_BASE, adsApiHeaders } from "./ads";

const BASE = ADS_API_BASE;
// Czech Republic geo target constant — keeps volumes locally relevant.
const GEO_CZECHIA = "geoTargetConstants/2203";

function num(v: string | number | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function competitionBand(level: string | undefined, index: number): Competition {
  if (level === "HIGH") return "high";
  if (level === "MEDIUM") return "medium";
  if (level === "LOW") return "low";
  return index >= 66 ? "high" : index >= 33 ? "medium" : "low";
}

/** Unknown competition → mid (index 50), the same documented default the Sklik adapter
 *  uses (`SKLIK_DEFAULT_COMPETITION_INDEX`). The Planner omits `competitionIndex` for
 *  thin or newly-seen terms; reading that absence as 0 handed the idea FULL ease points
 *  in `opportunityScore` (1 − 0/100), so an unknown-difficulty keyword outranked one
 *  with a reported mid competition by 20 points on the same volume. An unknown sinks,
 *  never flatters (registry: marketing / keyword-metric-reliability,
 *  `unknown-metric-sinks-never-flatters`). A REPORTED "0" is kept as 0 — the platform
 *  said so, and that is a measurement, not an absence. */
export const PLANNER_DEFAULT_COMPETITION_INDEX = 50;

function competitionIndexOf(v: string | number | undefined): number {
  if (v == null || v === "") return PLANNER_DEFAULT_COMPETITION_INDEX;
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return PLANNER_DEFAULT_COMPETITION_INDEX;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Map one Planner idea row onto the neutral RawKeywordIdea. Exported (pure) so the
 *  absent-competition rule can be pinned without a network. */
export function mapPlannerIdea(r: IdeaRow): RawKeywordIdea | null {
  if (!r.text) return null;
  const m = r.keywordIdeaMetrics ?? {};
  const competitionIndex = competitionIndexOf(m.competitionIndex);
  return {
    keyword: r.text,
    avgMonthlySearches: num(m.avgMonthlySearches),
    competition: competitionBand(m.competition, competitionIndex),
    competitionIndex,
    // micros of the account currency → CZK
    lowBidCzk: Math.round(num(m.lowTopOfPageBidMicros) / 1_000_000),
    highBidCzk: Math.round(num(m.highTopOfPageBidMicros) / 1_000_000),
  };
}

interface IdeaRow {
  text?: string;
  keywordIdeaMetrics?: {
    avgMonthlySearches?: string | number;
    competition?: string;
    competitionIndex?: string | number;
    lowTopOfPageBidMicros?: string | number;
    highTopOfPageBidMicros?: string | number;
  };
}

/** Keyword ideas for a seed term (and optional landing-page URL) from the user's
 *  Google Ads account. Throws on a non-OK response so the engine can fall back. */
export async function generateKeywordIdeas(
  accessToken: string,
  customerId: string,
  seed: string,
  url?: string
): Promise<RawKeywordIdea[]> {
  const body: Record<string, unknown> = {
    geoTargetConstants: [GEO_CZECHIA],
    keywordPlanNetwork: "GOOGLE_SEARCH",
    pageSize: 30,
  };
  // Seed by keyword, by URL, or both — whichever the caller supplied.
  if (url && seed) body.keywordAndUrlSeed = { url, keywords: [seed] };
  else if (url) body.urlSeed = { url };
  else body.keywordSeed = { keywords: [seed] };

  const res = await fetch(`${BASE}/customers/${customerId.replace(/\D/g, "")}:generateKeywordIdeas`, {
    method: "POST",
    headers: adsApiHeaders(accessToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Google Ads generateKeywordIdeas ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as { results?: IdeaRow[] };

  return (json.results ?? []).map(mapPlannerIdea).filter((idea): idea is RawKeywordIdea => idea !== null);
}
