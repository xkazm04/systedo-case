/** Google Ads Keyword Planner client (REST, server-only, dependency-free). Calls
 *  KeywordPlanIdeaService.generateKeywordIdeas on behalf of the signed-in user
 *  (their OAuth token + the app's developer token) and maps the result into the
 *  framework-free RawKeywordIdea model. Requires GOOGLE_ADS_DEVELOPER_TOKEN;
 *  without it the engine stays on sample data and this is never called. */
import "server-only";
import type { Competition, RawKeywordIdea } from "@/lib/keywords/types";

const API_VERSION = "v18";
const BASE = `https://googleads.googleapis.com/${API_VERSION}`;
// Czech Republic geo target constant — keeps volumes locally relevant.
const GEO_CZECHIA = "geoTargetConstants/2203";

function headers(accessToken: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  };
  const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "");
  if (login) h["login-customer-id"] = login;
  return h;
}

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
    headers: headers(accessToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Google Ads generateKeywordIdeas ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as { results?: IdeaRow[] };

  return (json.results ?? [])
    .filter((r) => r.text)
    .map((r) => {
      const m = r.keywordIdeaMetrics ?? {};
      const competitionIndex = num(m.competitionIndex);
      return {
        keyword: r.text!,
        avgMonthlySearches: num(m.avgMonthlySearches),
        competition: competitionBand(m.competition, competitionIndex),
        competitionIndex,
        // micros of the account currency → CZK
        lowBidCzk: Math.round(num(m.lowTopOfPageBidMicros) / 1_000_000),
        highBidCzk: Math.round(num(m.highTopOfPageBidMicros) / 1_000_000),
      } satisfies RawKeywordIdea;
    });
}
