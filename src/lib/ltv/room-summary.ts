/** Room summary for CAC → LTV on the Performance roof (ADR-0013): the blended
 *  LTV:CAC ratio, flagged when it falls under 3. */
import "server-only";
import { resolveCohorts } from "./resolve";
import { ltvSummary } from "./compute";
import { say, type Summarizer } from "@/lib/projects/roof";

const summarize: Summarizer = async ({ project, locale }) => {
  const s = ltvSummary(resolveCohorts(project));
  if (s.signups === 0) return { status: "empty" };
  const ratio = s.avgLtvCac;
  return {
    status: ratio >= 3 ? "ok" : "attention",
    metric: { label: "LTV : CAC", value: `${ratio.toFixed(1)}×` },
    note: ratio < 3 ? say(locale, "Pod obvyklou hranicí 3×.", "Under the usual 3× line.") : undefined,
    source: "sample",
  };
};
export default summarize;
