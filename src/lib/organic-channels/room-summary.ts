/** Room summary for Kanály zdarma on the Channels roof (ADR-0013): how many of
 *  the free channels are live. Reads the same resolver as the room; no sample
 *  plan is built here — a project that never tracked a channel is "not started". */
import "server-only";
import { resolveOrganicChannels } from "./resolve";
import { count, say, type Summarizer } from "@/lib/projects/roof";

const summarize: Summarizer = async ({ project, userId, locale }) => {
  const r = await resolveOrganicChannels(project.id, [], { userId });
  const tracks = Object.values(r.tracks);
  const live = tracks.filter((t) => t.stage === "live").length;
  const planned = tracks.filter((t) => t.stage === "planned").length;
  if (tracks.length === 0) {
    return { status: "empty", note: say(locale, "Vyberte první kanál z plánu.", "Pick the first channel from the plan.") };
  }
  return {
    status: live > 0 ? "ok" : "attention",
    metric: { label: say(locale, "Živé kanály", "Live channels"), value: count(locale, live) },
    note:
      planned > 0
        ? say(locale, `${planned} naplánováno, čeká na spuštění.`, `${planned} planned, waiting to go live.`)
        : undefined,
  };
};
export default summarize;
