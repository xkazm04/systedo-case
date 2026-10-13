/** Room summary for Schránka zpráv on the Channels roof (ADR-0013): enquiries
 *  still waiting for a first reply, and how many are past their SLA. */
import "server-only";
import { resolveInboxLeads } from "./resolve-inbox";
import { count, say, type Summarizer } from "@/lib/projects/roof";

const DEFAULT_SLA_MIN = 60;

const summarize: Summarizer = async ({ project, locale }) => {
  const { live, leads } = await resolveInboxLeads(project);
  const waiting = leads.filter((l) => l.respondedSec === undefined);
  const late = waiting.filter((l) => l.minutesAgo > (l.slaTargetMin ?? DEFAULT_SLA_MIN)).length;
  if (waiting.length === 0) {
    return { status: "ok", note: say(locale, "Vše zodpovězeno.", "Everything answered."), source: live ? undefined : "sample" };
  }
  return {
    status: "attention",
    metric: { label: say(locale, "Čeká na odpověď", "Waiting for a reply"), value: count(locale, waiting.length) },
    note: late > 0 ? say(locale, `${late} po termínu SLA.`, `${late} past the SLA.`) : undefined,
    source: live ? "live" : "sample",
  };
};
export default summarize;
