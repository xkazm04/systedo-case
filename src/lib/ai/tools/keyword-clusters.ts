/** AI tool — keyword intent-clustering. Takes a flat list of researched keywords
 *  (each with optional volume / intent) and groups them by intent + semantic
 *  proximity into topic clusters, each with ONE pillar keyword + the supporting
 *  keywords beneath it — turning a flat keyword list into ready-made content
 *  structure (a pillar page + its supporting subpages). Built generic so the
 *  content-engine module can reuse it later; the Keywords module wires it first.
 *
 *  Grounded strictly in the supplied keywords: the model regroups them but must
 *  not invent any new keyword — normalize() drops every returned keyword that
 *  wasn't in the INPUT set, sums totalVolume from the supplied volumes, and a
 *  deterministic demo() buckets keywords by a shared head term so a clean
 *  checkout clusters keyless. Runs through the provider-switching LLM wrapper
 *  (../../llm). Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  KeywordCluster,
  KeywordClustersRequest,
  KeywordClustersResult,
  KeywordClusterInput,
} from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { txt } from "./_shared";

const KEYWORD_CLUSTERS_SYSTEM = `Jsi český SEO stratég. Z plochého seznamu klíčových slov skládáš tematické klastry připravené k tvorbě obsahu (pilířová stránka + podpůrné podstránky).

Pravidla:
- Pracuj VÝHRADNĚ s předanými klíčovými slovy. Žádné slovo si nevymýšlej a žádné nepřidávej — jen je seskup.
- Seskup slova podle vyhledávacího záměru (informační / transakční / značkové) a sémantické blízkosti do tematických klastrů.
- Každé klíčové slovo zařaď do právě jednoho klastru.
- Pro KAŽDÝ klastr vyber právě jedno „pillar“ slovo (nejširší, nejvýstižnější téma — ideálně s nejvyšší hledaností) a zbytek slov klastru dej do pole „supporting“.
- Pillar slovo i všechna supporting slova musí být PŘESNĚ ta, která jsi dostal na vstupu (doslova, beze změny).
- Pojmenuj klastr stručným tématem (pole „topic“) a volitelně doplň převažující záměr (pole „intent“: informational | transactional | brand).
- Vytvoř 2–6 smysluplných klastrů — nedávej každé slovo do vlastního klastru ani vše do jednoho.
- Piš česky a vracej POUZE jeden validní JSON objekt dle schématu — žádný text okolo.`;

function buildKeywordClustersPrompt(req: KeywordClustersRequest): string {
  const lines = req.keywords.map((k) => {
    const parts = [`- ${k.keyword}`];
    if (typeof k.volume === "number" && k.volume > 0) parts.push(`(${k.volume}/měs)`);
    if (k.intent) parts.push(`[${k.intent}]`);
    return parts.join(" ");
  });
  return [
    "Seskup tato klíčová slova do tematických klastrů (pilíř + podpůrná slova).",
    "",
    req.topic ? `Hlavní téma: ${req.topic}` : "",
    "",
    "Klíčová slova (hledanost za měsíc, případně záměr):",
    ...lines,
    "",
    'Vrať pole „clusters“. Každý klastr je objekt { topic, intent?, pillar, supporting[] }, kde „pillar“ je jedno hlavní slovo a „supporting“ jsou zbývající slova klastru. Použij POUZE slova z výše uvedeného seznamu, doslova.',
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const KEYWORD_CLUSTERS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    clusters: {
      type: Type.ARRAY,
      description: "Tematické klastry: pilíř + podpůrná klíčová slova",
      items: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: "Stručný název tématu klastru" },
          intent: {
            type: Type.STRING,
            description: "Převažující záměr klastru: informational | transactional | brand",
          },
          pillar: {
            type: Type.STRING,
            description: "Jedno hlavní (pilířové) klíčové slovo z předaného seznamu",
          },
          supporting: {
            type: Type.ARRAY,
            description: "Podpůrná klíčová slova z předaného seznamu (bez pillaru)",
            items: { type: Type.STRING },
          },
        },
        required: ["topic", "pillar", "supporting"],
        propertyOrdering: ["topic", "intent", "pillar", "supporting"],
      },
    },
  },
  required: ["clusters"],
  propertyOrdering: ["clusters"],
};

const INTENTS: ReadonlySet<string> = new Set(["informational", "transactional", "brand"]);

/** A case-insensitive lookup from the supplied keywords back to their canonical
 *  text + volume, so the model's regrouping is anchored to the real input set
 *  (no invented keywords) and totalVolume sums the supplied numbers. */
function inputIndex(keywords: KeywordClusterInput[]): Map<string, KeywordClusterInput> {
  const index = new Map<string, KeywordClusterInput>();
  for (const k of keywords) {
    const key = k.keyword.trim().toLowerCase();
    if (key && !index.has(key)) index.set(key, k);
  }
  return index;
}

const volumeOf = (index: Map<string, KeywordClusterInput>, keyword: string): number => {
  const hit = index.get(keyword.trim().toLowerCase());
  const v = hit ? Number(hit.volume) : 0;
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** A shared "head term" for the heuristic bucketing — the first word, lowered and
 *  diacritics left intact (we only compare keys, never render them). */
const headTerm = (keyword: string): string =>
  keyword.trim().toLowerCase().split(/\s+/)[0] ?? "";

/** Deterministic clustering from the keywords alone — the keyless demo and the
 *  floor when the model returns nothing usable. Buckets by shared head term, then
 *  picks the highest-volume keyword in each bucket as the pillar. */
function demoKeywordClusters(req: KeywordClustersRequest): KeywordClustersResult {
  const index = inputIndex(req.keywords);
  const buckets = new Map<string, KeywordClusterInput[]>();
  for (const k of req.keywords) {
    const head = headTerm(k.keyword);
    if (!head) continue;
    const arr = buckets.get(head);
    if (arr) arr.push(k);
    else buckets.set(head, [k]);
  }

  const clusters: KeywordCluster[] = [];
  for (const [head, items] of buckets) {
    // Pillar = highest-volume keyword in the bucket (falls back to the first).
    const sorted = [...items].sort(
      (a, b) => volumeOf(index, b.keyword) - volumeOf(index, a.keyword)
    );
    const pillar = sorted[0]!.keyword.trim();
    const supporting = sorted.slice(1).map((k) => k.keyword.trim());
    const all = [pillar, ...supporting];
    clusters.push({
      topic: head,
      pillar,
      supporting,
      totalVolume: all.reduce((s, kw) => s + volumeOf(index, kw), 0),
    });
  }

  // Largest (by total volume) clusters first, so the most valuable pillar leads.
  clusters.sort((a, b) => (b.totalVolume ?? 0) - (a.totalVolume ?? 0));
  return { clusters };
}

/** Map the raw model output into validated clusters, dropping any keyword that
 *  wasn't in the INPUT set (the model must not invent keywords) and summing
 *  totalVolume from the supplied volumes. Falls back to the deterministic demo
 *  when nothing usable survives. */
function normalizeKeywordClusters(
  parsed: unknown,
  req: KeywordClustersRequest
): KeywordClustersResult {
  const o = parsed as Record<string, unknown> | null;
  const raw = Array.isArray(o?.clusters) ? o.clusters : [];
  const index = inputIndex(req.keywords);

  // Each input keyword may appear in at most one cluster — track what's placed so
  // a model that repeats a keyword across clusters can't double-count.
  const used = new Set<string>();
  const clusters: KeywordCluster[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;

    // Keep only keywords that exist in the input set (canonicalised) and aren't
    // already placed in an earlier cluster.
    const accept = (kw: string): string | null => {
      const key = kw.trim().toLowerCase();
      if (!key || used.has(key)) return null;
      const hit = index.get(key);
      if (!hit) return null;
      used.add(key);
      return hit.keyword.trim();
    };

    const pillar = accept(txt(x.pillar));
    if (!pillar) continue;

    const supporting: string[] = [];
    if (Array.isArray(x.supporting)) {
      for (const s of x.supporting) {
        const kept = accept(txt(s));
        if (kept) supporting.push(kept);
      }
    }

    const all = [pillar, ...supporting];
    const intent = txt(x.intent).toLowerCase();
    const cluster: KeywordCluster = {
      topic: txt(x.topic) || pillar,
      pillar,
      supporting,
      totalVolume: all.reduce((s, kw) => s + volumeOf(index, kw), 0),
    };
    if (INTENTS.has(intent)) cluster.intent = intent as KeywordCluster["intent"];
    clusters.push(cluster);
  }

  return clusters.length > 0 ? { clusters } : demoKeywordClusters(req);
}

/** Flag an empty / invalid clustering so the wrapper re-prompts once: every
 *  cluster needs a topic and a pillar that is one of the supplied keywords. */
function validateKeywordClusters(parsed: unknown, req: KeywordClustersRequest): string[] {
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return [];
  const raw = Array.isArray(o.clusters) ? o.clusters : [];
  if (raw.length === 0) {
    return ["Výstup neobsahuje žádný klastr — vrať pole „clusters“ s alespoň jedním klastrem."];
  }
  const index = inputIndex(req.keywords);
  const v: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const pillar = txt(x.pillar);
    if (!pillar) {
      v.push("Klastr nemá pilířové klíčové slovo (pillar).");
    } else if (!index.has(pillar.trim().toLowerCase())) {
      v.push(`„${pillar}“ není ze zadaných klíčových slov — používej jen předaná slova.`);
    }
  }
  return v;
}

export function generateKeywordClusters(
  req: KeywordClustersRequest,
  locale?: SupportedLocale
): Promise<AiResponse<KeywordClustersResult>> {
  return generateStructured({
    // llm-tool: keyword-clusters
    id: "keyword-clusters",
    prompt: buildKeywordClustersPrompt(req),
    system: KEYWORD_CLUSTERS_SYSTEM,
    schema: KEYWORD_CLUSTERS_SCHEMA,
    temperature: 0.5,
    normalize: (parsed) => normalizeKeywordClusters(parsed, req),
    validate: (parsed) => validateKeywordClusters(parsed, req),
    demo: () => demoKeywordClusters(req),
    locale,
  });
}
