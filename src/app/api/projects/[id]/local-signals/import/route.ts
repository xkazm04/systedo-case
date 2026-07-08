/** A2 — POST a rank export (pasted/CSV text) to bring a local project's real
 *  keyword-rank ladder in as the map module's source of truth. Per-user,
 *  ownership-checked; parses tolerantly and persists. Server-only. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { parseRankRows, ladderFromRows } from "@/lib/local-signals/import";
import { saveLocalSignals, clearLocalSignals } from "@/lib/local-signals/store";
import { fetchFeed, FeedFetchError } from "@/lib/catalog/feed-fetch";
import type { LocalSignalsSource } from "@/lib/local-signals/types";

const MAX_BYTES = 256_000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { text?: unknown; url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  // Two honest ingestion paths: pasted CSV, or a fetch of a hosted CSV the user
  // controls (a published Sheet / rank-tracker export) — the connector seam a paid
  // rank provider could later plug into. No pretend live SERP API.
  let text: string;
  let source: LocalSignalsSource;
  if (url) {
    try {
      text = await fetchFeed(url);
    } catch (err) {
      const msg = err instanceof FeedFetchError ? err.message : "Stažení z URL se nezdařilo.";
      return Response.json({ ok: false, error: msg }, { status: 400 });
    }
    source = "url";
  } else {
    text = typeof body?.text === "string" ? body.text : "";
    source = "import";
  }
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
    meta: {
      source,
      syncedAt: new Date().toISOString(),
      rowCount: rows.length,
      ...(source === "url" ? { sourceUrl: url } : {}),
    },
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
