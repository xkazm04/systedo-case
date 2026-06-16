/** Keyword research resolver: live Google Ads Keyword Planner when the signed-in
 *  user has a connected account + developer token + a valid OAuth token; the
 *  deterministic sample generator otherwise — so the tool works for everyone and
 *  lights up with real data once an account is connected. Server-only. */
import { getAdsConnection } from "@/lib/campaigns/connection";
import { getUserAccessToken } from "@/lib/google/token";
import { adsConfigured } from "@/lib/google/ads";
import { generateKeywordIdeas } from "@/lib/google/keyword-planner";
import { sampleKeywordIdeas } from "./sample";
import { finalizeKeywords, type KeywordResult, type RawKeywordIdea } from "./types";

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
  url?: string
): Promise<KeywordResult> {
  const { source, raw } = await fetchRaw(userId, seed, url);
  return finalizeKeywords(seed, source, raw);
}
