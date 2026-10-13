/** Room summary for LP experimenty on the Studio roof (ADR-0013): experiments
 *  still running and those finished. */
import "server-only";
import { resolveExperiments } from "./resolve";
import { experimentsForProject } from "./sample";
import { count, say, type Summarizer } from "@/lib/projects/roof";

const summarize: Summarizer = async ({ project, locale }) => {
  const { experiments, source } = await resolveExperiments(project.id, experimentsForProject(project));
  if (experiments.length === 0) return { status: "empty" };
  const running = experiments.filter((e) => e.status === "running").length;
  return {
    status: running > 0 ? "ok" : "attention",
    metric: { label: say(locale, "Běžící testy", "Running tests"), value: count(locale, running) },
    note: running === 0 ? say(locale, "Žádný test neběží.", "No test is running.") : undefined,
    source: source === "live" ? "live" : "sample",
  };
};
export default summarize;
