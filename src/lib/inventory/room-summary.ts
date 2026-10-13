/** Room summary for Sklad & sezónnost on the Reach roof (ADR-0013): products at
 *  risk of running out, and those whose ads should be paused for stock. */
import "server-only";
import { loadProductsFor } from "@/lib/catalog/load";
import { stockRows } from "./compute";
import { count, say, type Summarizer } from "@/lib/projects/roof";

const summarize: Summarizer = async ({ project, locale }) => {
  const rows = stockRows(await loadProductsFor(project));
  if (rows.length === 0) return { status: "empty", note: say(locale, "Zatím žádný katalog.", "No catalog yet.") };
  const atRisk = rows.filter((r) => r.atRisk).length;
  const pause = rows.filter((r) => r.status === "pause").length;
  return {
    status: atRisk + pause > 0 ? "attention" : "ok",
    metric: { label: say(locale, "Hrozí vyprodání", "At risk of selling out"), value: count(locale, atRisk) },
    note: pause > 0 ? say(locale, `${pause} k pozastavení reklamy.`, `${pause} to pause in ads.`) : undefined,
  };
};
export default summarize;
