/** Direction 2 — POST a CRM lead export (pasted CSV or a hosted-CSV URL) to make a
 *  leadgen/local project's funnel run on real leads instead of the illustrative
 *  sample. The rows feed the funnel/velocity/alerts + the recap grounding, honestly
 *  labelled live. Per-user, ownership-checked. Server-only. Mirrors the local-signals
 *  import route's auth + ingestion shape. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { parseLeadRows } from "@/lib/lead-quality/import";
import { saveLeadImports, clearLeadImports } from "@/lib/lead-quality/store";
import { fetchFeed, FeedFetchError } from "@/lib/catalog/feed-fetch";
import type { ImportedLeadsState } from "@/lib/lead-quality/types";
import { tooLarge } from "@/lib/ai/rate-limit";
import { envInt } from "@/lib/env";
import { apiError, asString, enforceUserRate, readJson, trimmedString, WORKSPACE_RATE } from "@/lib/api/route-utils";

const MAX_BYTES = 512_000;
/** Pre-parse content-length cap (the JSON envelope around the CSV is a little larger
 *  than the CSV itself, so this sits above MAX_BYTES to only catch genuinely oversized
 *  bodies before we buffer them; the post-parse MAX_BYTES check still applies). */
const MAX_BODY_BYTES = envInt("LEADS_MAX_BODY_BYTES", 1_000_000);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  // Reject an oversized body up front, then throttle before the fetch/parse work
  // (this route can fetch a hosted CSV — an outbound call worth rate-limiting).
  if (tooLarge(req, MAX_BODY_BYTES)) return apiError(413, "Import je příliš velký.", "content-too-long", { envelope: "ok" });
  const limited = enforceUserRate(uid, WORKSPACE_RATE.leadsImport(), "Příliš mnoho importů. Zkuste to prosím za chvíli.");
  if (limited) return limited;

  const body = await readJson<{ text?: unknown; url?: unknown }>(req);
  const url = trimmedString(body?.url);

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
      return apiError(400, msg, "bad-request", { envelope: "ok" });
    }
    source = "url";
  } else {
    text = asString(body?.text);
    source = "import";
  }
  if (text.length > MAX_BYTES) {
    return apiError(413, "Import je příliš velký.", "content-too-long", { envelope: "ok" });
  }

  const items = parseLeadRows(text);
  if (items.length === 0) {
    return apiError(
      400,
      "Nenašel jsem žádné leady. Formát: zdroj, fáze (lead/kvalifikovaný/příležitost/uzavřeno), datum, hodnota, datum uzavření.",
      "unprocessable",
      { envelope: "ok" }
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
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;
  await clearLeadImports(project.id);
  return Response.json({ ok: true });
}
