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
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { getTwin, saveTwin } from "@/lib/twin/store";
import { connectorFor } from "@/lib/twin/connectors";
import { channelConfig } from "@/lib/twin/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { draftId?: unknown } | null;
  const draftId = typeof body?.draftId === "string" ? body.draftId : "";
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
