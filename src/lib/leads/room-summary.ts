/** Room summary for Leady on the Channels roof (ADR-0013): how many contacts the
 *  project holds. The sample set is never counted as the tenant's own. */
import "server-only";
import { resolveContacts } from "./resolve";
import { count, say, type Summarizer } from "@/lib/projects/roof";

const summarize: Summarizer = async ({ project, locale }) => {
  const r = await resolveContacts(project, { limit: 1 });
  if (!r.live) {
    return { status: "empty", note: say(locale, "Zatím žádné vlastní kontakty.", "No contacts of your own yet."), source: "sample" };
  }
  return { status: "ok", metric: { label: say(locale, "Kontakty", "Contacts"), value: count(locale, r.total) }, source: "live" };
};
export default summarize;
