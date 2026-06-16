/** Saved winning patterns — the tenant's curated library (pinned auto-patterns +
 *  hand-written ones), persisted to Firestore `tenants/{tenant}/patterns`. The
 *  auto-derived patterns are computed live by `extract.ts`; this only stores the
 *  ones a user chose to keep. Server-only. */
import { randomBytes } from "node:crypto";
import { firestore } from "@/lib/firebase";
import { extractPatterns } from "./extract";
import { isPatternCategory, type Pattern, type PatternCategory } from "./types";

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

/** Compact pattern lines to ground the AI evaluation in proven wins. Saved
 *  patterns first (the user's curation), then the strongest auto-derived ones. */
export async function getPatternLines(tenant: string, limit = 6): Promise<string[]> {
  const { auto, saved } = await getLibrary(tenant);
  return [...saved, ...auto].slice(0, limit).map((p) => `- ${p.title}: ${p.insight}`);
}
