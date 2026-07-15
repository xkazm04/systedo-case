/** Persist a project's twin — the trained per-channel voice, the style facts it
 *  learned from, the channel/autonomy config and the draft outbox. Per-user,
 *  ownership-checked; the body is coerced to a clean, bounded blob (never trust the
 *  wire — the client POSTs the whole state). Server-only. Mirrors the
 *  organic-channels route's auth shape. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { saveTwin, clearTwin } from "@/lib/twin/store";
import { archiveDrafts, clearArchive, listArchivedRejects } from "@/lib/twin/archive-store";
import { partitionDrafts } from "@/lib/twin/archive";
import { channelConfig, decideDraft, sanitizeTwinState, type TwinState } from "@/lib/twin/types";
import { readJson } from "@/lib/api/route-utils";

/** Re-derive the autonomy gate server-side. `decideDraft` is "the one rule, in one
 *  place", but the client is the only caller, so a POSTed blob could otherwise claim
 *  `autoApproved: true` for a draft the gate would never clear (a review channel, a
 *  risky claim, low confidence) and `send/route.ts` would then treat it as vetted.
 *  A machine auto-approval must be independently re-derivable or it is not one — so
 *  any `autoApproved: true` that the gate rejects falls back to the gate's real
 *  verdict. Human approvals (`autoApproved: false`, owner-authenticated above) keep
 *  their lifecycle. Kept here, not in the client-imported `types.ts`. */
function enforceAutonomy(state: TwinState): TwinState {
  return {
    ...state,
    drafts: state.drafts.map((d) => {
      // The gate only governs the pending↔approved transition. `sent`/`rejected` are
      // terminal states past its jurisdiction — re-deriving them would stomp a sent
      // draft back to `approved` (it still clears the gate), erasing the send from the
      // audit trail and making an auto-drafted message re-send-eligible on next commit.
      if (!d.autoApproved || d.status === "sent" || d.status === "rejected") return d;
      const verdict = decideDraft(channelConfig(state.channels, d.channel), d);
      return verdict.autoApproved
        ? { ...d, status: "approved" as const, autoApproved: true }
        : { ...d, status: verdict.status, autoApproved: false };
    }),
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const body = await readJson(req);
  const state = enforceAutonomy(sanitizeTwinState(body));

  // Split live (pending/approved) from terminal (sent/rejected) drafts. Terminal
  // records beyond the recent window ARCHIVE out of the hot blob instead of being
  // silently sliced at the wire cap. Eviction from the blob happens ONLY once the
  // archive write succeeds, so a store hiccup keeps the records hot (retried next
  // save) rather than losing them. A legacy oversized blob archives on this first
  // save. `updatedAt` is refreshed AFTER the split so the timestamp isn't archived
  // stale onto the records.
  const { hot, archive } = partitionDrafts(state.drafts);
  let keptDrafts = state.drafts;
  if (archive.length > 0) {
    try {
      await archiveDrafts(project.id, archive);
      keptDrafts = hot;
    } catch (err) {
      console.warn(
        `[twin] archive failed for ${project.id}; keeping ${archive.length} terminal record(s) hot:`,
        err
      );
    }
  } else {
    keptDrafts = hot;
  }

  await saveTwin(project.id, { ...state, drafts: keptDrafts, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true });
}

/** The project's recent archived REJECTS — the bounded read the client folds back
 *  into its rejection tally so learning doesn't regress as older rejects move to
 *  history. Read-only; owner-checked like the writes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  let rejects: Awaited<ReturnType<typeof listArchivedRejects>> = [];
  try {
    rejects = await listArchivedRejects(g.project.id, 200);
  } catch (err) {
    console.warn(`[twin] archived-rejects read failed for ${g.project.id}:`, err);
  }
  return Response.json({ rejects });
}

/** Untrain the twin: back to the seeded per-type sample, empty outbox. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;
  await clearTwin(project.id);
  // Untrain wipes the outbox history too — the archive is part of "this twin".
  try {
    await clearArchive(project.id);
  } catch (err) {
    console.warn(`[twin] archive clear failed for ${project.id}:`, err);
  }
  return Response.json({ ok: true });
}
