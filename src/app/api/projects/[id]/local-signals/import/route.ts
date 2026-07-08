/** A2 — POST a rank export (pasted/CSV text) to bring a local project's real
 *  keyword-rank ladder in as the map module's source of truth. Per-user,
 *  ownership-checked; parses tolerantly and persists. Server-only. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { parseRankRows, ladderFromRows } from "@/lib/local-signals/import";
import { saveLocalSignals, clearLocalSignals } from "@/lib/local-signals/store";

const MAX_BYTES = 256_000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (text.length > MAX_BYTES) {
    return Response.json({ ok: false, error: "Import je příliš velký." }, { status: 413 });
  }

  const rows = parseRankRows(text);
  if (rows.length === 0) {
    return Response.json(
      { ok: false, error: "Nenašel jsem žádné pozice. Formát: klíčové slovo, oblast, pozice." },
      { status: 400 }
    );
  }

  await saveLocalSignals(project.id, {
    meta: { source: "import", syncedAt: new Date().toISOString(), rowCount: rows.length },
    ladder: ladderFromRows(rows),
  });
  return Response.json({ ok: true, rowCount: rows.length });
}

/** Revert to the illustrative sample ladder. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });
  await clearLocalSignals(project.id);
  return Response.json({ ok: true });
}
