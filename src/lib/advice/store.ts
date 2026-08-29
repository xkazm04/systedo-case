/** Where the advice ledger lives — the thin read/write layer over `project_state`
 *  key "adviceLedger". The pure math is ./ledger; the render-time hook is ./record.
 *  Server-only.
 *
 *  STORAGE CHOICE (the organic-outcomes precedent, for the same reasons): one bounded
 *  blob per project — at most ADVICE_LEDGER_CAP small records — with no query needs of
 *  its own. It costs no migration on either backend, and project deletion already
 *  cascades `project_state`, so a deleted project's ledger goes with it.
 *
 *  Every write is a compare-and-swap (`mutateProjectState`). It has to be: the writer
 *  is a RENDER, and two tabs (or a portfolio view and a project view) can render the
 *  same project's overview at once. Under last-write-wins one of them would silently
 *  drop the other's sighting; under CAS the loser re-reads and re-applies. */
import "server-only";
import { getProjectState, mutateProjectState } from "@/lib/project-state/store";
import { PROJECT_STATE_KEYS } from "@/lib/project-state/keys";
import { sanitizeAdviceLedger, type AdviceLedger, type AdviceRecord } from "./ledger";

/** The registry key this blob lives under — declared centrally, so a second feature
 *  cannot claim it without a compile error. */
const ADVICE_KEY = "adviceLedger" satisfies keyof typeof PROJECT_STATE_KEYS;

/** The project's ledger, or null when nothing has ever been recorded (or the read
 *  failed — every caller treats both as "nothing tracked yet"). Never throws: this
 *  sits on a page render, and an unreadable ledger must cost a chip, not the page. */
export async function getAdviceLedger(userId: string, projectId: string): Promise<AdviceLedger | null> {
  try {
    return sanitizeAdviceLedger(await getProjectState<AdviceLedger>(userId, projectId, ADVICE_KEY));
  } catch (err) {
    console.error(`[advice] ledger read failed for ${projectId}:`, err);
    return null;
  }
}

/** Read-modify-write the ledger under compare-and-swap. `mutate` MUST be pure — it can
 *  run more than once (see mutateProjectState). Returns the blob that was persisted. */
export async function mutateAdviceLedger(
  userId: string,
  projectId: string,
  mutate: (current: AdviceLedger | null) => AdviceLedger
): Promise<AdviceLedger> {
  return mutateProjectState<AdviceLedger>(userId, projectId, ADVICE_KEY, (current) =>
    mutate(sanitizeAdviceLedger(current))
  );
}

/** Flip ONE subject's status. The narrow, per-record write the status route exposes —
 *  never a whole-blob replacement, so a client can only ever say "not this one" /
 *  "show it again" about a subject the ledger already knows.
 *
 *  `resolved` is deliberately unreachable from here: it is machine-minted by
 *  updateAdviceLedger together with the outcome that justifies it, and a client-set
 *  "resolved" would be a status with no measurement behind it. Returns null when the
 *  subject is unknown (→ the route's 404). */
export async function setAdviceSubjectStatus(
  userId: string,
  projectId: string,
  subjectKey: string,
  status: "dismissed" | "open",
  now: Date
): Promise<AdviceRecord | null> {
  let hit: AdviceRecord | null = null;
  const nowIso = now.toISOString();
  await mutateAdviceLedger(userId, projectId, (current) => {
    hit = null;
    const records = (current?.records ?? []).map((r) => {
      if (r.subjectKey !== subjectKey) return r;
      const next: AdviceRecord = { ...r, status };
      if (status === "dismissed") {
        next.dismissedAt = nowIso;
      } else {
        delete next.dismissedAt;
        // Un-dismissing restores an OPEN subject, never a resolved one — the machine
        // owns that transition and will re-resolve on the clock if it stays absent.
        delete next.resolvedAt;
        delete next.outcome;
      }
      hit = next;
      return next;
    });
    return { records, updatedAt: nowIso };
  });
  return hit;
}
