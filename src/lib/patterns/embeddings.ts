/** Gemini text embeddings for semantic retrieval over the winning-patterns
 *  library (RAG). Best-effort: returns null when no GEMINI_API_KEY / on failure,
 *  so callers fall back to deterministic ordering. Server-only. */
import { createHash } from "node:crypto";
import { recordLlmCall } from "@/lib/llm/telemetry";

const BASE = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
const MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";
/** Coarse embedding cost (gemini-embedding-001 ≈ $0.15 / 1M input chars). */
const EMBED_USD_PER_CHAR = 0.15 / 1_000_000;

// Content-keyed vector cache. The pattern corpus is stable text, so re-embedding
// it on every search was O(searches × patterns); cached, each search only pays to
// embed the (usually novel) query. Process-level + size-bounded.
const vecCache = new Map<string, number[]>();
const VEC_CACHE_MAX = 2000;
const cacheKey = (text: string): string => createHash("sha1").update(text).digest("hex");

async function embedOne(text: string, key: string): Promise<number[]> {
  const res = await fetch(`${BASE}/models/${MODEL}:embedContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${MODEL}`,
      content: { parts: [{ text: text.slice(0, 2000) }] },
    }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  const json = (await res.json()) as { embedding?: { values?: number[] } };
  return json.embedding?.values ?? [];
}

/** Embed a batch of texts (one request each, in parallel), returning one vector
 *  per input (same order), or null when embeddings are unavailable. Vectors are
 *  cached by content hash, so only texts not seen before incur an API call — a
 *  re-search over the same pattern corpus embeds just the new query. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || texts.length === 0) return null;

  const out: (number[] | null)[] = texts.map((t) => vecCache.get(cacheKey(t)) ?? null);
  const missIdx = out.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

  if (missIdx.length > 0) {
    const t0 = Date.now();
    try {
      const fresh = await Promise.all(missIdx.map((i) => embedOne(texts[i], key)));
      if (!fresh.every((v) => v.length > 0)) return null;
      missIdx.forEach((i, j) => {
        out[i] = fresh[j];
        vecCache.set(cacheKey(texts[i]), fresh[j]);
      });
      // Telemetry so embeddings show up in the same eval dashboard as the text
      // tools (previously this modality recorded nothing). Best-effort.
      const chars = missIdx.reduce((s, i) => s + Math.min(texts[i].length, 2000), 0);
      await recordLlmCall({
        toolId: "patterns-embed",
        promptHash: "embed",
        provider: "gemini",
        model: MODEL,
        demo: false,
        tookMs: Date.now() - t0,
        attempts: 1,
        repaired: false,
        estCostUsd: chars * EMBED_USD_PER_CHAR,
        inputTokens: Math.round(chars / 4),
        outputTokens: 0,
        at: new Date().toISOString(),
      });
      while (vecCache.size > VEC_CACHE_MAX) {
        const oldest = vecCache.keys().next().value;
        if (oldest === undefined) break;
        vecCache.delete(oldest);
      }
    } catch (err) {
      console.error("[embed] error:", err);
      return null;
    }
  }
  return out.every((v): v is number[] => Array.isArray(v) && v.length > 0) ? out : null;
}

/** Cosine similarity of two equal-length vectors (0 when either is degenerate). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
