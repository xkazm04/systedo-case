/** Room summary for Zisk on the Performance roof (ADR-0013): contribution after
 *  ad spend over the last 30 days of the same dataset Výkon and Zisk resolve. */
import "server-only";
import { resolveReportDataset } from "./resolve";
import { totalsOf } from "@/lib/metrics/totals";
import { czk, say, type Summarizer } from "@/lib/projects/roof";

const summarize: Summarizer = async ({ project, locale }) => {
  const r = await resolveReportDataset(project);
  const t = totalsOf(r.data.daily.slice(-30));
  return {
    status: t.profit >= 0 ? "ok" : "attention",
    metric: { label: say(locale, "Příspěvek po reklamě · 30 dní", "Contribution after ads · 30 days"), value: czk(locale, t.profit) },
    source: r.live ? "live" : "sample",
  };
};
export default summarize;
