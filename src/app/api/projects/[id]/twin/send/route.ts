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
import { asString, enforceUserRate, readJson, WORKSPACE_RATE } from "@/lib/api/route-utils";

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
  if (!draftId) return Response.json({ ok: false, error: "Chybí draftId." }, { status: 400 });

  const state = await getTwin(project.id);
  const draft = state?.drafts.find((d) => d.id === draftId);
  if (!state || !draft) return Response.json({ ok: false, error: "Koncept nenalezen." }, { status: 404 });
  if (draft.status !== "approved") {
    return Response.json({ ok: false, error: "Odeslat lze jen schválený koncept." }, { status: 409 });
  }

  const cfg = channelConfig(state.channels, draft.channel);
  const connector = connectorFor(cfg.connector);
  if (!connector.configured) {
    return Response.json({ ok: false, error: `Konektor „${connector.label}" není nastavený.` }, { status: 409 });
  }

  let result;
  try {
    result = await connector.send({ channel: draft.channel, contact: draft.contact, body: draft.reply });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Odeslání selhalo.";
    return Response.json({ ok: false, error: detail }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  await saveTwin(project.id, {
    ...state,
    drafts: state.drafts.map((d) => (d.id === draftId ? { ...d, status: "sent" as const, sentAt } : d)),
    updatedAt: sentAt,
  });

  return Response.json({ ok: true, delivered: result.delivered, mode: result.mode, detail: result.detail, sentAt });
}
