/** Saved winning patterns — the tenant's curated library (pinned auto-patterns +
 *  hand-written ones), persisted to Firestore `tenants/{tenant}/patterns`. The
 *  auto-derived patterns are computed live by `extract.ts`; this only stores the
 *  ones a user chose to keep. Server-only. */
import { randomBytes } from "node:crypto";
import { firestore } from "@/lib/firebase";
import { extractPatterns } from "./extract";
import { cosine, embedTexts } from "./embeddings";
import { isPatternCategory, type Pattern, type PatternCategory, type RankedPattern } from "./types";

function patternsCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("patterns");
}

export async function listSavedPatterns(tenant: string): Promise<Pattern[]> {
  const snap = await patternsCol(tenant).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Pattern, "id">) }));
}

export interface SavePatternInput {
  title: string;
  category: PatternCategory;
  insight: string;
  evidence?: string;
}

export async function savePattern(tenant: string, input: SavePatternInput): Promise<Pattern> {
  const id = randomBytes(10).toString("hex");
  const pattern: Omit<Pattern, "id"> = {
    title: input.title.slice(0, 140),
    category: isPatternCategory(input.category) ? input.category : "structure",
    insight: input.insight.slice(0, 600),
    evidence: (input.evidence ?? "").slice(0, 400),
    source: "manual",
    createdAt: new Date().toISOString(),
  };
  await patternsCol(tenant).doc(id).set(pattern);
  return { id, ...pattern };
}

export async function deletePattern(tenant: string, id: string): Promise<boolean> {
  const ref = patternsCol(tenant).doc(id);
  if (!(await ref.get()).exists) return false;
  await ref.delete();
  return true;
}

/** The library view: live auto-derived patterns + the saved set (deduped by
 *  title, saved winning over auto so a pinned one isn't shown twice). */
export async function getLibrary(
  tenant: string
): Promise<{ auto: Pattern[]; saved: Pattern[] }> {
  const [auto, saved] = await Promise.all([extractPatterns(tenant), listSavedPatterns(tenant)]);
  const savedTitles = new Set(saved.map((p) => p.title.toLowerCase()));
  return { auto: auto.filter((p) => !savedTitles.has(p.title.toLowerCase())), saved };
}

/** Semantic search over the tenant's library (saved + auto): ranks patterns by
 *  cosine similarity to the query. Falls back to substring matching when
 *  embeddings are unavailable (`semantic: false`). */
export async function searchPatterns(
  tenant: string,
  query: string
): Promise<{ results: RankedPattern[]; semantic: boolean }> {
  const { auto, saved } = await getLibrary(tenant);
  const all = [...saved, ...auto];
  if (all.length === 0) return { results: [], semantic: false };

  const texts = all.map((p) => `${p.title}. ${p.insight} ${p.evidence}`.trim());
  const vecs = await embedTexts([query, ...texts]);
  if (vecs) {
    const [q, ...patternVecs] = vecs;
    const results = all
      .map((p, i) => ({ ...p, relevance: cosine(q!, patternVecs[i]!) }))
      .sort((a, b) => b.relevance - a.relevance);
    return { results, semantic: true };
  }

  // Fallback: case-insensitive substring match.
  const ql = query.toLowerCase();
  const results = all
    .map((p) => ({
      ...p,
      relevance: `${p.title} ${p.insight} ${p.evidence}`.toLowerCase().includes(ql) ? 1 : 0,
    }))
    .filter((p) => p.relevance > 0);
  return { results, semantic: false };
}

/** Compact pattern lines to ground the AI evaluation in proven wins.
 *
 *  With a `query` (the current portfolio situation) and embeddings available, the
 *  patterns are ranked by *semantic relevance* to that situation (RAG) — so the
 *  model sees the lessons that actually apply now. Falls back to deterministic
 *  order (saved first, then auto) when no query / embeddings are unavailable. */
export async function getPatternLines(tenant: string, query?: string, limit = 6): Promise<string[]> {
  const { auto, saved } = await getLibrary(tenant);
  const all = [...saved, ...auto];
  if (all.length === 0) return [];
  const line = (p: Pattern) => `- ${p.title}: ${p.insight}`;

  if (query && all.length > 1) {
    const texts = all.map((p) => `${p.title}. ${p.insight} ${p.evidence}`.trim());
    const vecs = await embedTexts([query, ...texts]);
    if (vecs) {
      const [q, ...patternVecs] = vecs;
      return all
        .map((p, i) => ({ p, score: cosine(q!, patternVecs[i]!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => line(x.p));
    }
  }
  return all.slice(0, limit).map(line);
}
