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
import { getTwin, saveTwin } from "@/lib/twin/store";
import { connectorFor } from "@/lib/twin/connectors";
import { channelConfig } from "@/lib/twin/types";
import { apiError, asString, conflict, enforceUserRate, providerError, readJson, WORKSPACE_RATE } from "@/lib/api/route-utils";

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

  const state = await getTwin(project.id);
  const draft = state?.drafts.find((d) => d.id === draftId);
  if (!state || !draft) return apiError(404, "Koncept nenalezen.", "not-found", { envelope: "ok" });
  if (draft.status !== "approved") {
    return conflict("Odeslat lze jen schválený koncept.", "not-approved", { envelope: "ok" });
  }

  const cfg = channelConfig(state.channels, draft.channel);
  const connector = connectorFor(cfg.connector);
  if (!connector.configured) {
    return conflict(`Konektor „${connector.label}" není nastavený.`, "conflict", { envelope: "ok" });
  }

  let result;
  try {
    result = await connector.send({ channel: draft.channel, contact: draft.contact, body: draft.reply });
  } catch (err) {
    // Was a RAW connector error string handed to the client. Now a coded category
    // with a generic Czech message; the raw text is server-logged only.
    return providerError({
      category: "provider-error",
      message: "Odeslání přes konektor selhalo.",
      raw: err,
      context: `twin-send ${draft.channel}`,
      envelope: "ok",
    });
  }

  const sentAt = new Date().toISOString();
  await saveTwin(project.id, {
    ...state,
    drafts: state.drafts.map((d) => (d.id === draftId ? { ...d, status: "sent" as const, sentAt } : d)),
    updatedAt: sentAt,
  });

  return Response.json({ ok: true, delivered: result.delivered, mode: result.mode, detail: result.detail, sentAt });
}
