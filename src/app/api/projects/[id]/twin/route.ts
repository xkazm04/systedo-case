/** Persist a project's twin — the trained per-channel voice, the style facts it
 *  learned from, the channel/autonomy config and the draft outbox. Per-user,
 *  ownership-checked; the body is a SCOPED COMMIT SLICE ({voices?, channels?,
 *  facts?, addFacts?, drafts?}) merged over the stored blob inside the atomic
 *  mutate — a legacy full-state blob is simply a slice with every key present.
 *  Never trust the wire: each section runs its sanitizer. Server-only. Mirrors the
 *  organic-channels route's auth shape. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { mutateTwin, clearTwin } from "@/lib/twin/store";
import { archiveDrafts, clearArchive, listArchivedRejects } from "@/lib/twin/archive-store";
import { partitionDrafts } from "@/lib/twin/archive";
import {
  applyTwinCommit,
  channelConfig,
  decideDraft,
  isTerminalDraft,
  sanitizeTwinCommit,
  type TwinState,
} from "@/lib/twin/types";
import { storableConnectorId } from "@/lib/twin/connectors";
import { enforceUserRate, readJson, WORKSPACE_RATE } from "@/lib/api/route-utils";

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

/** Post-save archive pass, thrown to skip the eviction write when the twin was
 *  deleted between the two mutates (nothing to evict from). */
class SkipEvict extends Error {}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  // Per-user cap on the write path — every outbox interaction commits here, and the
  // POST used to be the one twin route without a limiter (send-only coverage).
  const limited = enforceUserRate(uid, WORKSPACE_RATE.twinCommit(), "Příliš mnoho uložení. Zkuste to prosím za chvíli.");
  if (limited) return limited;

  const body = await readJson(req);
  const slice = sanitizeTwinCommit(body);

  // Merge the slice over the STORED blob inside one atomic mutate. applyTwinCommit
  // carries both draft-lifecycle guards against the stored state (closing the
  // check-then-act window against a concurrent send/route.ts claim):
  //
  //  WHEN each lifecycle event fires — the contract this route enforces:
  //   • `pending`/`approved`  — client-asserted here (the human loop), with the
  //     machine `autoApproved` bit re-derived by enforceAutonomy on the merged state.
  //   • `rejected` (+decidedAt) — client-asserted here; a human "no" is a genuine
  //     client-side decision and feeds the rejection-learning tally.
  //   • `sent` (+sentAt)      — NEVER minted here. enforceServerSent demotes any
  //     freshly client-claimed `sent` to `approved`; the only writer of the
  //     approved→sent transition is send/route.ts's atomic claim.
  //   • a STORED terminal record (`sent`/`rejected`) is frozen: mergeTerminalDrafts
  //     makes it win over whatever the posted slice says for that id.
  const saved = await mutateTwin(project.id, (prev) => ({
    ...enforceConnectors(enforceAutonomy(applyTwinCommit(prev, slice))),
    updatedAt: new Date().toISOString(),
  }));

  // Archive pass, AFTER the merge (upserts grow the stored outbox, so the overflow
  // is only known post-save): terminal records beyond the recent window move to the
  // history store. Eviction from the hot blob happens ONLY once the archive write
  // succeeds — a store hiccup keeps the records hot (retried next save) rather than
  // losing them. Only still-terminal records with the archived ids are evicted, so
  // a record that changed between the two mutates is never dropped.
  const { archive } = partitionDrafts(saved.drafts);
  if (archive.length > 0) {
    try {
      await archiveDrafts(project.id, archive);
      const archivedIds = new Set(archive.map((d) => d.id));
      await mutateTwin(project.id, (prev) => {
        if (!prev) throw new SkipEvict();
        return { ...prev, drafts: prev.drafts.filter((d) => !(archivedIds.has(d.id) && isTerminalDraft(d))) };
      });
    } catch (err) {
      if (!(err instanceof SkipEvict)) {
        console.warn(
          `[twin] archive failed for ${project.id}; keeping ${archive.length} terminal record(s) hot:`,
          err
        );
      }
    }
  }
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
