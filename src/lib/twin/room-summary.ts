/** Room summary for Twin on the Channels roof (ADR-0013): whether the twin
 *  speaks in a voice the tenant trained, and in how many scopes. */
import "server-only";
import { resolveTwin } from "./resolve";
import { count, say, type Summarizer } from "@/lib/projects/roof";

const summarize: Summarizer = async ({ project, locale }) => {
  const r = await resolveTwin(project.id, project.type);
  const trained = r.trainedScopes.length;
  if (trained === 0) {
    return {
      status: "attention",
      note: say(locale, "Hlas zatím není natrénovaný — twin mluví ukázkovým.", "The voice is not trained yet — the twin speaks the sample one."),
    };
  }
  return { status: "ok", metric: { label: say(locale, "Natrénované hlasy", "Trained voices"), value: count(locale, trained) } };
};
export default summarize;
