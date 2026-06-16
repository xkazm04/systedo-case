/** Gemini text embeddings for semantic retrieval over the winning-patterns
 *  library (RAG). Best-effort: returns null when no GEMINI_API_KEY / on failure,
 *  so callers fall back to deterministic ordering. Server-only. */
const BASE = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
const MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

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

/** Embed a batch of texts (one request each, in parallel). Returns one vector per
 *  input (same order), or null when embeddings are unavailable. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || texts.length === 0) return null;
  try {
    const vecs = await Promise.all(texts.map((t) => embedOne(t, key)));
    return vecs.every((v) => v.length > 0) ? vecs : null;
  } catch (err) {
    console.error("[embed] error:", err);
    return null;
  }
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
