/** Keyword research resolver: live Google Ads Keyword Planner when the signed-in
 *  user has a connected account + developer token + a valid OAuth token; the
 *  deterministic sample generator otherwise — so the tool works for everyone and
 *  lights up with real data once an account is connected. Server-only. */
import { getAdsConnection } from "@/lib/campaigns/connection";
import { getUserAccessToken } from "@/lib/google/token";
import { adsConfigured } from "@/lib/google/ads";
import { generateKeywordIdeas } from "@/lib/google/keyword-planner";
import { getProject } from "@/lib/projects/store";
import { DEMO_PROJECTS } from "@/lib/demo/projects";
import { sampleKeywordIdeas } from "./sample";
import { finalizeKeywords, type KeywordResult, type RawKeywordIdea } from "./types";

/** Resolve the tenant's brand NAME so finalizeKeywords can fire its brand-intent
 *  branch (a keyword containing the brand → "brand"). Same demo-public / user-owned
 *  resolution as resolveBrandContext, but returning the bare project name (the token
 *  the classifier matches) rather than the grounding paragraph. undefined when there
 *  is no project → the brand branch stays dormant and the anonymous path is unchanged. */
async function resolveBrandName(
  userId: string | null,
  projectId?: string
): Promise<string | undefined> {
  if (!projectId) return undefined;
  const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
  if (demo) return demo.name;
  if (userId) {
    const project = await getProject(userId, projectId);
    if (project) return project.name;
  }
  return undefined;
}

async function fetchRaw(
  userId: string | null,
  seed: string,
  url?: string
): Promise<{ source: KeywordResult["source"]; raw: RawKeywordIdea[] }> {
  if (userId && adsConfigured()) {
    const connection = await getAdsConnection(userId);
    if (connection) {
      const token = await getUserAccessToken(userId);
      if (token) {
        try {
          const raw = await generateKeywordIdeas(token, connection.customerId, seed, url);
          // An empty live result is unhelpful — fall back to sample below.
          if (raw.length > 0) return { source: "google-ads", raw };
        } catch (err) {
          console.error("[keywords] live fetch failed, using sample:", err);
        }
      }
    }
  }
  return { source: "sample", raw: sampleKeywordIdeas(seed) };
}

/** Keyword ideas for a seed (and optional landing URL), finalized with intent +
 *  opportunity scoring and grouped by intent. */
export async function researchKeywords(
  userId: string | null,
  seed: string,
  url?: string,
  /** the active project, when known — resolves the brand so brand-name keywords
   *  classify as "brand" intent. Omitted (anonymous / no project) → no brand match,
   *  behavior unchanged. */
  projectId?: string
): Promise<KeywordResult> {
  const [{ source, raw }, brand] = await Promise.all([
    fetchRaw(userId, seed, url),
    resolveBrandName(userId, projectId),
  ]);
  return finalizeKeywords(seed, source, raw, brand);
}
