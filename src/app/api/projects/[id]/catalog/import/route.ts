/** Import a product feed into a project's catalog. Per-user, ownership-checked,
 *  server-only. Accepts pasted/uploaded feed CONTENT (Heureka / Zboží.cz / Google
 *  XML or CSV) — a URL-fetch path (SSRF-guarded) is a deliberate follow-up. Two
 *  modes: "preview" returns the diff without saving; "apply" merges + persists. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { listOfferings, saveOfferings } from "@/lib/catalog/store";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { isProduct, type ProductOffering } from "@/lib/catalog/offering";
import { feedItemsToOfferings, parseFeed, sourceForFormat, type FeedFormat } from "@/lib/catalog/feed";
import { mergeCatalog, type ImportStrategy } from "@/lib/catalog/import";
import { FeedFetchError, fetchFeed } from "@/lib/catalog/feed-fetch";
import { CATALOG_MAX_BODY_BYTES, CATALOG_RATE, enforceCatalogRate } from "@/lib/catalog/rate-limit";
import { payloadTooLarge, tooLarge } from "@/lib/ai/rate-limit";
import { emitProjectActivity } from "@/lib/activity/emit";

/** Guard against a pathological paste (~12 MB of text). */
const MAX_CONTENT = 12_000_000;
const FORMATS: FeedFormat[] = ["heureka", "google", "csv"];
const STRATEGIES: ImportStrategy[] = ["merge", "replace"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;
  const { uid } = g;

  // Reject an oversized body up front, then throttle before the fetch/parse work.
  if (tooLarge(req, CATALOG_MAX_BODY_BYTES)) return payloadTooLarge("Feed je příliš velký.");
  const limited = enforceCatalogRate(uid, CATALOG_RATE.import());
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    content?: unknown;
    url?: unknown;
    format?: unknown;
    mode?: unknown;
    strategy?: unknown;
  } | null;

  // Either paste feed content, or supply a URL we fetch server-side (SSRF-guarded).
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  let content: string;
  if (url) {
    try {
      content = await fetchFeed(url);
    } catch (e) {
      return Response.json(
        { error: e instanceof FeedFetchError ? e.message : "Feed se nepodařilo stáhnout." },
        { status: 400 }
      );
    }
  } else {
    content = typeof body?.content === "string" ? body.content : "";
  }
  if (!content.trim()) return Response.json({ error: "Vložte obsah feedu nebo URL." }, { status: 400 });
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
  await emitProjectActivity(uid, id, {
    kind: "update",
    module: "katalog",
    severity: "info",
    title: "Katalog importován z feedu",
    detail: `${parsed.format} · ${next.length} položek`,
    actor: "Vy",
  });
  return Response.json({ ok: true, applied: true, format: parsed.format, warnings: parsed.warnings, diff, offerings: next, count: next.length });
}
