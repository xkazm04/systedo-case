/** Import a product feed into a project's catalog. Per-user, ownership-checked,
 *  server-only. Accepts pasted/uploaded feed CONTENT (Heureka / Zboží.cz / Google
 *  XML or CSV) — a URL-fetch path (SSRF-guarded) is a deliberate follow-up. Two
 *  modes: "preview" returns the diff without saving; "apply" merges + persists. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { listOfferings, saveOfferings } from "@/lib/catalog/store";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { isProduct, type ProductOffering } from "@/lib/catalog/offering";
import { feedItemsToOfferings, parseFeed, sourceForFormat, type FeedFormat } from "@/lib/catalog/feed";
import { mergeCatalog, type ImportStrategy } from "@/lib/catalog/import";

/** Guard against a pathological paste (~12 MB of text). */
const MAX_CONTENT = 12_000_000;
const FORMATS: FeedFormat[] = ["heureka", "google", "csv"];
const STRATEGIES: ImportStrategy[] = ["merge", "replace"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const { id } = await params;
  const project = await getProject(uid, id);
  if (!project) return Response.json({ error: "Projekt nenalezen." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    content?: unknown;
    format?: unknown;
    mode?: unknown;
    strategy?: unknown;
  } | null;

  const content = typeof body?.content === "string" ? body.content : "";
  if (!content.trim()) return Response.json({ error: "Vložte obsah feedu." }, { status: 400 });
  if (content.length > MAX_CONTENT) return Response.json({ error: "Feed je příliš velký." }, { status: 413 });

  const format = FORMATS.includes(body?.format as FeedFormat) ? (body!.format as FeedFormat) : undefined;
  const strategy = STRATEGIES.includes(body?.strategy as ImportStrategy)
    ? (body!.strategy as ImportStrategy)
    : "merge";
  const apply = body?.mode === "apply";

  const parsed = parseFeed(content, format);
  if (parsed.items.length === 0) {
    return Response.json({ error: "Feed neobsahuje žádné položky.", warnings: parsed.warnings }, { status: 422 });
  }

  const now = new Date().toISOString();
  // Sanitize because the feed text is user-supplied; keep only products.
  const incoming = sanitizeOfferings(
    feedItemsToOfferings(parsed.items, id, sourceForFormat(parsed.format), now),
    id,
    now
  ).filter(isProduct) as ProductOffering[];

  // Merge against the STORED catalog (not the demo seed) so a real import stays clean.
  const current = (await listOfferings(uid, id)) ?? [];
  const { next, diff } = mergeCatalog(current, incoming, strategy, now);

  if (!apply) {
    return Response.json({ ok: true, applied: false, format: parsed.format, warnings: parsed.warnings, diff });
  }

  await saveOfferings(uid, id, next);
  return Response.json({ ok: true, applied: true, format: parsed.format, warnings: parsed.warnings, diff, offerings: next, count: next.length });
}
