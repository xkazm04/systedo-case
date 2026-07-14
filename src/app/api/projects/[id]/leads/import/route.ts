/** Direction 2 — POST a CRM lead export (pasted CSV or a hosted-CSV URL) to make a
 *  leadgen/local project's funnel run on real leads instead of the illustrative
 *  sample. The rows feed the funnel/velocity/alerts + the recap grounding, honestly
 *  labelled live. Per-user, ownership-checked. Server-only. Mirrors the local-signals
 *  import route's auth + ingestion shape. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { parseLeadRows } from "@/lib/lead-quality/import";
import { saveLeadImports, clearLeadImports } from "@/lib/lead-quality/store";
import { fetchFeed, FeedFetchError } from "@/lib/catalog/feed-fetch";
import type { ImportedLeadsState } from "@/lib/lead-quality/types";

const MAX_BYTES = 512_000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { text?: unknown; url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  // Two honest ingestion paths: pasted CSV, or a fetch of a hosted CSV the user
  // controls (a published Sheet / export) — the connector seam a paid CRM could
  // later plug into. No pretend live API.
  let text: string;
  let source: ImportedLeadsState["source"];
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

  const items = parseLeadRows(text);
  if (items.length === 0) {
    return Response.json(
      { ok: false, error: "Nenašel jsem žádné leady. Formát: zdroj, fáze (lead/kvalifikovaný/příležitost/uzavřeno), datum, hodnota, datum uzavření." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  await saveLeadImports(project.id, {
    items,
    source,
    syncedAt: now,
    ...(source === "url" ? { sourceUrl: url } : {}),
    updatedAt: now,
  });
  return Response.json({ ok: true, rowCount: items.length });
}

/** Revert to the illustrative sample funnel by dropping the imported leads. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });
  await clearLeadImports(project.id);
  return Response.json({ ok: true });
}
