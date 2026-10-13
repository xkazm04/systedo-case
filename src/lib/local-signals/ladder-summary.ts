/** Room summary for Mapa & pozice on the Local roof (ADR-0013): how many tracked
 *  local searches the business holds a map-pack spot (top 3) for. */
import "server-only";
import { resolveLocalLadder } from "./resolve";
import { keywordLadder } from "@/lib/mappack/sample";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";
import { count, say, type Summarizer } from "@/lib/projects/roof";

const summarize: Summarizer = async ({ project, locale }) => {
  const services = await loadServicesFor(project);
  const r = await resolveLocalLadder(project.id, keywordLadder(project, localitiesFor(project), services));
  if (r.ladder.length === 0) return { status: "empty" };
  const inPack = r.ladder.filter((k) => k.current > 0 && k.current <= 3).length;
  return {
    status: inPack * 2 >= r.ladder.length ? "ok" : "attention",
    metric: { label: say(locale, "V top 3 na mapě", "In the map top 3"), value: `${count(locale, inPack)} / ${count(locale, r.ladder.length)}` },
    source: r.live ? "live" : "sample",
  };
};
export default summarize;
