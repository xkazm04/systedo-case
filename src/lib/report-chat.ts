/** Server helpers for the "Datový report → chat" surface: the deterministic
 *  opening report and the contextual topic chips, both derived from the same
 *  performance snapshot the live chat is grounded in. Server-only (pulls the
 *  base performance dataset + analysis fallback). */
import { buildSnapshot } from "./snapshot";
import { demoAnalysis } from "./ai/tools/analysis";
import type { AnalysisPeriod, AnalysisResult } from "./ai-types";
import type { PerformanceData } from "./types";
import type { SupportedLocale } from "./format";

/** The instant, deterministic report shown in the rail (no LLM call). Grounds on
 *  `data` (a project's dataset) when given, else the base case-study. */
export function reportFor(period: AnalysisPeriod, data?: PerformanceData): AnalysisResult {
  return demoAnalysis(buildSnapshot(period, "previous", data));
}

/** Four opening questions — the weakest paid channel is named so the first
 *  chip is specific to this period's (project) data. */
export function reportChips(period: AnalysisPeriod, locale: SupportedLocale, data?: PerformanceData): string[] {
  const s = buildSnapshot(period, "previous", data);
  const paid = s.channels.filter((c) => c.cost > 0);
  const worst = [...paid].sort((a, b) => b.pno - a.pno)[0];
  if (locale === "en") {
    return [
      worst ? `Why is ${worst.channel}'s PNO so high?` : "Which channel is weakest?",
      "Where is the biggest room to grow?",
      "Compare channels by ROAS",
      "What should I do this week?",
    ];
  }
  return [
    worst ? `Proč má ${worst.channel} tak vysoké PNO?` : "Který kanál je nejslabší?",
    "Kde je největší prostor pro růst?",
    "Srovnej kanály podle ROAS",
    "Co udělat tento týden?",
  ];
}
