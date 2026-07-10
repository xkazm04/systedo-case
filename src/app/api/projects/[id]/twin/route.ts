/** Persist a project's twin — the trained per-channel voice, the style facts it
 *  learned from, the channel/autonomy config and the draft outbox. Per-user,
 *  ownership-checked; the body is coerced to a clean, bounded blob (never trust the
 *  wire — the client POSTs the whole state). Server-only. Mirrors the
 *  organic-channels route's auth shape. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { saveTwin, clearTwin } from "@/lib/twin/store";
import { channelConfig, decideDraft, sanitizeTwinState, type TwinState } from "@/lib/twin/types";

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
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const state = enforceAutonomy(sanitizeTwinState(body));
  await saveTwin(project.id, { ...state, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true });
}

/** Untrain the twin: back to the seeded per-type sample, empty outbox. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });
  await clearTwin(project.id);
  return Response.json({ ok: true });
}
