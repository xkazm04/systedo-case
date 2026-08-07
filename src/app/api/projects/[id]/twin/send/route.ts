/** Deliver an approved draft through its channel's connector.
 *
 *  This runs server-side on purpose: a real connector holds credentials, and the
 *  decision "is this draft allowed to leave the building" must not be a client
 *  claim. The route re-reads the SAVED state (not the posted one), so a client that
 *  lies about a draft's status cannot smuggle an unapproved message out; the client
 *  persists first, then asks to send.
 *
 *  Today the only configured connector is `manual`, which reports `delivered:false`
 *  and hands the text back to be pasted. The draft is still marked `sent` — that is
 *  the human recording their own send — and the response says plainly that Adamant
 *  transmitted nothing. See src/lib/twin/connectors.ts. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { mutateTwin } from "@/lib/twin/store";
import { connectorFor } from "@/lib/twin/connectors";
import { retryRevert } from "@/lib/twin/send-claim";
import { channelConfig, type TwinState } from "@/lib/twin/types";
import { apiError, asString, conflict, enforceUserRate, providerError, readJson, WORKSPACE_RATE } from "@/lib/api/route-utils";

/** A non-deliverable outcome decided inside the atomic claim, thrown so the mutate
 *  rolls back without a write (except the deliberate claim). */
class SendSignal extends Error {
  constructor(
    readonly kind: "not-found" | "not-approved" | "connector-unconfigured" | "already-sent",
    readonly info: { sentAt?: string; connectorLabel?: string } = {}
  ) {
    super(kind);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  // Throttle before the external channel-connector delivery.
  const limited = enforceUserRate(uid, WORKSPACE_RATE.twinSend(), "Příliš mnoho odeslání. Zkuste to prosím za chvíli.");
  if (limited) return limited;

  const body = await readJson<{ draftId?: unknown }>(req);
  const draftId = asString(body?.draftId);
  if (!draftId) return apiError(400, "Chybí draftId.", "missing-field", { envelope: "ok" });

  const sentAt = new Date().toISOString();
  // Atomic compare-and-set claim: flip approved→sent up front INSIDE the transaction, so
  // a second concurrent send (double-click / two tabs) finds it already `sent` and is a
  // no-op instead of delivering the message a second time. A stale full-state /twin save
  // can no longer un-set it either (mergeTerminalDrafts there keeps the stored `sent`).
  let claimedState: TwinState;
  try {
    claimedState = await mutateTwin(project.id, (prev) => {
      const draft = prev?.drafts.find((d) => d.id === draftId);
      if (!prev || !draft) throw new SendSignal("not-found");
      if (draft.status === "sent") throw new SendSignal("already-sent", { sentAt: draft.sentAt });
      if (draft.status !== "approved") throw new SendSignal("not-approved");
      const cfg = channelConfig(prev.channels, draft.channel);
      const connector = connectorFor(cfg.connector);
      if (!connector.configured) throw new SendSignal("connector-unconfigured", { connectorLabel: connector.label });
      return {
        ...prev,
        drafts: prev.drafts.map((d) => (d.id === draftId ? { ...d, status: "sent" as const, sentAt } : d)),
        updatedAt: sentAt,
      };
    });
  } catch (e) {
    if (e instanceof SendSignal) {
      switch (e.kind) {
        case "already-sent":
          // Idempotent: the draft is already delivered/recorded — report success with
          // its recorded time, never re-deliver.
          return Response.json({
            ok: true,
            delivered: false,
            mode: "manual",
            detail: "Tento koncept už byl odeslán.",
            sentAt: e.info.sentAt ?? sentAt,
          });
        case "not-found":
          return apiError(404, "Koncept nenalezen.", "not-found", { envelope: "ok" });
        case "not-approved":
          return conflict("Odeslat lze jen schválený koncept.", "not-approved", { envelope: "ok" });
        case "connector-unconfigured":
          return conflict(`Konektor „${e.info.connectorLabel}" není nastavený.`, "conflict", { envelope: "ok" });
      }
    }
    throw e;
  }

  const draft = claimedState.drafts.find((d) => d.id === draftId);
  if (!draft) return apiError(404, "Koncept nenalezen.", "not-found", { envelope: "ok" });
  const cfg = channelConfig(claimedState.channels, draft.channel);
  const connector = connectorFor(cfg.connector);

  let result;
  try {
    result = await connector.send({ channel: draft.channel, contact: draft.contact, body: draft.reply });
  } catch (err) {
    // Delivery failed after we optimistically claimed the draft `sent` — revert it to
    // `approved` (only if still OUR claim, matched by the sentAt stamp) so the human can
    // retry. The revert is RETRIED, never fire-and-forget: a swallowed revert failure
    // used to strand a permanently-"sent" draft that never left the building. If every
    // attempt fails, the strand is logged loudly — a later save can't fix it silently
    // (mergeTerminalDrafts freezes stored terminal records), so the operator must know.
    // Was a RAW connector error string handed to the client; now a coded category with a
    // generic Czech message and the raw text server-logged only.
    const reverted = await retryRevert(
      async () => {
        try {
          await mutateTwin(project.id, (prev) => {
            // Twin blob gone mid-send (untrained/deleted): nothing to revert — treat as
            // done rather than writing a resurrected empty state.
            if (!prev) throw new SendSignal("not-found");
            return {
              ...prev,
              drafts: prev.drafts.map((d) =>
                d.id === draftId && d.status === "sent" && d.sentAt === sentAt
                  ? { ...d, status: "approved" as const, sentAt: undefined }
                  : d
              ),
            };
          });
        } catch (e) {
          if (!(e instanceof SendSignal)) throw e;
        }
      },
      undefined,
      (e, attempt) => console.warn(`[twin] send revert attempt ${attempt} failed for ${project.id}/${draftId}:`, e)
    );
    if (!reverted) {
      console.error(
        `[twin] send revert FAILED for ${project.id}/${draftId} — draft may be stranded as 'sent' although delivery failed`
      );
    }
    return providerError({
      category: "provider-error",
      message: "Odeslání přes konektor selhalo.",
      raw: err,
      context: `twin-send ${draft.channel}`,
      envelope: "ok",
    });
  }

  return Response.json({ ok: true, delivered: result.delivered, mode: result.mode, detail: result.detail, sentAt });
}
