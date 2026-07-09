/** Illustrative LLM spend — per-operation / per-model usage receipts, seeded per
 *  project. Shaped after the real telemetry entry (src/lib/llm/telemetry.ts,
 *  recorded at recordLlmCall) + cost model (src/lib/llm/cost.ts). The live rollup
 *  aggregates the `llmTelemetry` collection over a period. Framework-free. */
import type { Project } from "@/lib/projects/types";
import { seed01 } from "@/lib/project-data/seed";

export interface SpendEntry {
  id: string;
  /** operation id (AiMode) */
  toolId: string;
  model: string;
  calls: number;
  tokens: number;
  costUsd: number;
  daysAgo: number;
}

const OPS = [
  "analysis", "ads", "brief", "article-draft", "local-review-reply",
  "keyword-clusters", "chat", "repurpose", "twin-reply",
];

/** blended $/1M-token rate, mirroring the tiers in src/lib/llm/cost.ts */
const MODELS: { id: string; rate: number }[] = [
  { id: "gemini-2.0-flash", rate: 0.3 },
  { id: "claude-sonnet-4", rate: 3.0 },
  { id: "gpt-4o-mini", rate: 0.15 },
];

export function spendForProject(project: Project, count = 64): SpendEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const s = (k: string) => seed01(`${project.id}:spend:${i}:${k}`);
    const toolId = OPS[Math.floor(s("op") * OPS.length)];
    const model = MODELS[Math.floor(s("model") * MODELS.length)];
    const calls = 1 + Math.floor(s("calls") * 5);
    const tokens = calls * (500 + Math.floor(s("tok") * 7500));
    const costUsd = Math.round((tokens / 1e6) * model.rate * 1e4) / 1e4;
    return {
      id: `spend-${i}`,
      toolId,
      model: model.id,
      calls,
      tokens,
      costUsd,
      daysAgo: Math.floor(s("days") * 60),
    };
  });
}
