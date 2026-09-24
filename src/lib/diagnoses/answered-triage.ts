/** The /recenze inbox triage's answered review-ids — ONE read shared by the local
 *  diagnosis (resolve-request.ts) and the Overview's local recs (insights/resolve.ts),
 *  so the two surfaces cannot disagree about which negative reviews still await a
 *  reply. Takes the uid as a parameter: the caller already knows who is asking, and
 *  the Overview must not pull the whole diagnosis resolver just to learn it.
 *  Server-only (project_state read). */
import "server-only";
import { getProjectState } from "@/lib/project-state/store";

/** The answered ids, or undefined when no triage is stored (or there is no signed-in
 *  user). Best-effort: a store hiccup degrades to "no triage" so both surfaces still
 *  resolve on the review set alone. The "reviews" key mirrors ReviewInbox's persisted
 *  state shape (answered/flagged/drafts). */
export async function resolveAnsweredTriage(
  uid: string | null | undefined,
  projectId: string
): Promise<string[] | undefined> {
  if (!uid) return undefined;
  try {
    const state = await getProjectState<{ answered?: unknown }>(uid, projectId, "reviews");
    return Array.isArray(state?.answered)
      ? state.answered.filter((id): id is string => typeof id === "string")
      : undefined;
  } catch {
    return undefined;
  }
}
