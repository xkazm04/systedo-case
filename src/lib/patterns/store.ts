/** Saved winning patterns — the tenant's curated library (pinned auto-patterns +
 *  hand-written ones), persisted to Firestore `tenants/{tenant}/patterns`. The
 *  auto-derived patterns are computed live by `extract.ts`; this only stores the
 *  ones a user chose to keep. Server-only. */
import { randomBytes } from "node:crypto";
import { firestore } from "@/lib/firebase";
import { getSyncMeta } from "@/lib/campaigns/store";
import {
  contradictedSavedIds,
  extractPatternsWithContext,
  patternPromptLine,
  promptSafePatterns,
  sampleLessonPatterns,
} from "./extract";
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
 *  title, saved winning over auto so a pinned one isn't shown twice).
 *
 *  `pnoGoal` is threaded to the extractor so auto-patterns are mined against the
 *  tenant's own agreed target (defaults to the paid-portfolio 0.18 — see
 *  extractPatterns). Callers that already hold the client profile pass its goal so
 *  no extra Firestore read is made. */
export async function getLibrary(
  tenant: string,
  pnoGoal?: number,
  projectId?: string
): Promise<{ auto: Pattern[]; saved: Pattern[] }> {
  const [{ patterns: mined, context }, saved] = await Promise.all([
    extractPatternsWithContext(tenant, pnoGoal, projectId),
    listSavedPatterns(tenant),
  ]);
  // Campaign-mined patterns + the demo-derived creative/targeting sample lessons.
  // The library is a lessons surface, so sample lessons show for every tenant
  // (their insight says "(ukázková lekce)"); the AI-prompt path filters them out
  // for live tenants in getPatternLines instead.
  const auto = [...mined, ...sampleLessonPatterns()];
  const savedTitles = new Set(saved.map((p) => p.title.toLowerCase()));
  // Direction 2: flag saved pins that fresh mined data now contradicts (named
  // campaign/type/channel fell below target since it was pinned). The flag drives
  // the library warning + the prompt exclusion in getPatternLines; the pin itself
  // is never deleted — the user unpins.
  const contradicted = contradictedSavedIds(saved, context);
  const annotatedSaved = contradicted.size
    ? saved.map((p) => (contradicted.has(p.id) ? { ...p, contradicted: true } : p))
    : saved;
  return {
    auto: auto.filter((p) => !savedTitles.has(p.title.toLowerCase())),
    saved: annotatedSaved,
  };
}

/** Is this tenant's stored campaign set LIVE account data? True only when the
 *  last sync came from a live source and did NOT degrade to the sample fallback —
 *  the same truth-in-labeling signal the campaigns UI uses (SyncMeta.source +
 *  degraded). Never-synced / sample / degraded tenants read as not-live. */
async function isLiveTenant(tenant: string): Promise<boolean> {
  const meta = await getSyncMeta(tenant);
  return Boolean(meta && meta.source !== "sample" && !meta.degraded);
}

/** Semantic search over the tenant's library (saved + auto): ranks patterns by
 *  cosine similarity to the query. Falls back to substring matching when
 *  embeddings are unavailable (`semantic: false`). */
export async function searchPatterns(
  tenant: string,
  query: string,
  pnoGoal?: number,
  projectId?: string
): Promise<{ results: RankedPattern[]; semantic: boolean }> {
  const { auto, saved } = await getLibrary(tenant, pnoGoal, projectId);
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
export async function getPatternLines(
  tenant: string,
  query?: string,
  limit = 6,
  pnoGoal?: number,
  projectId?: string
): Promise<string[]> {
  const [{ auto, saved }, live] = await Promise.all([
    getLibrary(tenant, pnoGoal, projectId),
    isLiveTenant(tenant),
  ]);
  // Prompt integrity: a live tenant's "proven patterns from this account" block
  // must not carry the demo-derived sample lessons (see promptSafePatterns) —
  // only lessons mined from their real data and their own manual saves. Direction 2:
  // a saved pin fresh data now contradicts is also dropped (getLibrary flagged it) —
  // a stale scaling template must not keep grounding prompts after its campaign craters.
  const all = promptSafePatterns([...saved, ...auto], live).filter((p) => !p.contradicted);
  if (all.length === 0) return [];
  // Each line carries a compact evidence clause when the pattern has proof (which
  // win backs it) — dynamic USER-prompt content, so the fingerprint goldens hold.
  const line = patternPromptLine;

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
