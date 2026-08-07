/** Persist a project's twin — the trained per-channel voice, the style facts it
 *  learned from, the channel/autonomy config and the draft outbox. Per-user,
 *  ownership-checked; the body is coerced to a clean, bounded blob (never trust the
 *  wire — the client POSTs the whole state). Server-only. Mirrors the
 *  organic-channels route's auth shape. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { mutateTwin, clearTwin } from "@/lib/twin/store";
import { archiveDrafts, clearArchive, listArchivedRejects } from "@/lib/twin/archive-store";
import { partitionDrafts } from "@/lib/twin/archive";
import {
  channelConfig,
  decideDraft,
  enforceServerSent,
  mergeTerminalDrafts,
  sanitizeTwinState,
  type TwinState,
} from "@/lib/twin/types";
import { storableConnectorId } from "@/lib/twin/connectors";
import { readJson } from "@/lib/api/route-utils";

/** Re-derive the autonomy gate server-side so the `autoApproved` audit bit is owned by
 *  the gate, not by the client blob. `decideDraft` is "the one rule, in one place", but
 *  the client is the only caller, so a POSTed blob could otherwise (a) claim
 *  `autoApproved: true` for a draft the gate would never clear (a disabled/review
 *  channel, a risky claim, low confidence) and have `send/route.ts` treat it as vetted,
 *  or (b) LAUNDER a machine approval as human by flipping `autoApproved` to false on a
 *  draft the gate WOULD auto-approve. A machine auto-approval must be independently
 *  re-derivable or it is not one — so the bit is recomputed for EVERY non-terminal
 *  draft: it clears the gate → `approved`/`autoApproved:true`; it does not → the flag is
 *  forced false (a human `approved`/`pending` status stands — that transition is
 *  genuinely client-asserted). Kept here, not in the client-imported `types.ts`. */
function enforceAutonomy(state: TwinState): TwinState {
  return {
    ...state,
    drafts: state.drafts.map((d) => {
      // The gate only governs the pending↔approved transition. `sent`/`rejected` are
      // terminal states past its jurisdiction — re-deriving them would stomp a sent
      // draft back to `approved` (it still clears the gate), erasing the send from the
      // audit trail and making an auto-drafted message re-send-eligible on next commit.
      // (mergeTerminalDrafts below independently defends a STORED terminal record.)
      if (d.status === "sent" || d.status === "rejected") return d;
      const verdict = decideDraft(channelConfig(state.channels, d.channel), d);
      if (verdict.autoApproved) return { ...d, status: "approved" as const, autoApproved: true };
      // Gate says no: strip any claimed machine approval. Whatever human status the
      // client asserts (pending/approved) stands, but it can never carry autoApproved.
      return d.autoApproved ? { ...d, autoApproved: false } : d;
    }),
  };
}

/** Reconcile each channel's connector to one that actually exists AND is configured in
 *  this environment. sanitizeChannelConfig only shape-checks the free-text connector id
 *  (client-safe), so a typo or a stale/unconfigured id could persist and then throw when
 *  a human approves a draft — the worst place to discover a config error. Done here (not
 *  in the client-imported types.ts) because `configured` is env-dependent. */
function enforceConnectors(state: TwinState): TwinState {
  return {
    ...state,
    channels: state.channels.map((c) => {
      const connector = storableConnectorId(c.connector);
      return connector === c.connector ? c : { ...c, connector };
    }),
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const body = await readJson(req);
  const state = enforceConnectors(enforceAutonomy(sanitizeTwinState(body)));

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

  // Write atomically, with the two draft-lifecycle guards run against the STORED
  // state inside the same transaction (closing the check-then-act window against a
  // concurrent send/route.ts claim):
  //
  //  WHEN each lifecycle event fires — the contract this route enforces:
  //   • `pending`/`approved`  — client-asserted here (the human loop), with the
  //     machine `autoApproved` bit re-derived by enforceAutonomy above.
  //   • `rejected` (+decidedAt) — client-asserted here; a human "no" is a genuine
  //     client-side decision and feeds the rejection-learning tally.
  //   • `sent` (+sentAt)      — NEVER minted here. enforceServerSent demotes any
  //     freshly client-claimed `sent` to `approved`; the only writer of the
  //     approved→sent transition is send/route.ts's atomic claim.
  //   • a STORED terminal record (`sent`/`rejected`) is frozen: mergeTerminalDrafts
  //     makes it win over whatever the posted blob says for that id.
  await mutateTwin(project.id, (prev) => ({
    ...state,
    drafts: mergeTerminalDrafts(prev?.drafts, enforceServerSent(prev?.drafts, keptDrafts)),
    updatedAt: new Date().toISOString(),
  }));
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
