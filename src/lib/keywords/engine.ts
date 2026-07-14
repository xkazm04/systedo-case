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
import { SklikClient, httpSklikTransport } from "@/lib/sklik/client";
import { fetchSklikKeywordIdeas } from "@/lib/sklik/keywords";
import { sampleKeywordIdeas } from "./sample";
import {
  finalizeKeywords,
  mergeRawIdeas,
  type KeywordResult,
  type KeywordSource,
  type RawKeywordIdea,
} from "./types";

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

/** Sklik keyword suggestions for a seed, when SKLIK_API_TOKEN is configured. Returns []
 *  (and logs) on ANY failure or an empty result, so a Sklik hiccup can never break — or
 *  visibly alter — keyword research; the caller then serves the Google/sample result
 *  exactly as before. The real HTTP transport is used here; the mapping is exercised
 *  offline via fetchSklikKeywordIdeas' injectable-client fixture tests. */
async function fetchSklikIdeas(seed: string): Promise<RawKeywordIdea[]> {
  const token = process.env.SKLIK_API_TOKEN;
  if (!token) return [];
  try {
    const client = new SklikClient(httpSklikTransport(), token);
    return await fetchSklikKeywordIdeas(client, seed);
  } catch (err) {
    console.error("[keywords] Sklik fetch failed, no Sklik contribution:", err);
    return [];
  }
}

/** Tag every idea in a base (Google/sample) list with its per-idea source label, so a
 *  merged result attributes each row. `google-ads` maps to the per-idea "google" label. */
function tagSource(raw: RawKeywordIdea[], source: KeywordSource): RawKeywordIdea[] {
  return raw.map((idea) => ({ ...idea, source }));
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
  const [{ source, raw }, brand, sklik] = await Promise.all([
    fetchRaw(userId, seed, url),
    resolveBrandName(userId, projectId),
    fetchSklikIdeas(seed),
  ]);
  // Sklik contributed nothing (unset token, error, or empty) → serve the Google/sample
  // result BYTE-IDENTICALLY: no per-idea source labels, no reordering. Only when Sklik
  // actually returns ideas do we merge (deduped, richer record wins) and label each row
  // by provider so the UI can show the mix. The result-level `source` stays the base
  // provider; the per-row badges convey the blend.
  if (sklik.length === 0) return finalizeKeywords(seed, source, raw, brand);
  const baseLabel: KeywordSource = source === "google-ads" ? "google" : "sample";
  const merged = mergeRawIdeas(tagSource(raw, baseLabel), sklik);
  return finalizeKeywords(seed, source, merged, brand);
}
