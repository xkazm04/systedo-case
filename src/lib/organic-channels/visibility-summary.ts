/** Room summary for Klíčová slova on the Reach roof (ADR-0013): how many steps
 *  the visibility plan holds this week, and whether any query feeds it yet. */
import "server-only";
import { resolveVisibilityPlan } from "./visibility-plan-resolve";
import { count, say, type Summarizer } from "@/lib/projects/roof";

const summarize: Summarizer = async ({ project, userId, locale }) => {
  const plan = await resolveVisibilityPlan(project, userId);
  if (!plan || plan.total === 0) {
    return { status: "empty", note: say(locale, "Zatím žádné dotazy ani kanály.", "No queries or channels yet.") };
  }
  return {
    status: plan.counts.queries > 0 ? "ok" : "attention",
    metric: { label: say(locale, "Kroků v plánu", "Plan steps"), value: count(locale, plan.total) },
    note:
      plan.counts.queries === 0
        ? say(locale, "Uložte klíčová slova, ať plán ví, co lidé hledají.", "Save keywords so the plan knows what people search for.")
        : undefined,
    source: plan.channelSource === "sample" ? "sample" : undefined,
  };
};
export default summarize;
