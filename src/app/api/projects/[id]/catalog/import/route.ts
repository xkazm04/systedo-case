/** Import a product feed into a project's catalog. Per-user, ownership-checked,
 *  server-only. Accepts pasted/uploaded feed CONTENT (Heureka / Zboží.cz / Google
 *  XML or CSV) — a URL-fetch path (SSRF-guarded) is a deliberate follow-up. Two
 *  modes: "preview" returns the diff without saving; "apply" merges + persists. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { listOfferings, saveOfferings } from "@/lib/catalog/store";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { isProduct, MAX_FEED_ITEMS, type ProductOffering } from "@/lib/catalog/offering";
import { feedItemsToOfferings, parseFeed, sourceForFormat, type FeedFormat } from "@/lib/catalog/feed";
import { mergeCatalog, type ImportStrategy } from "@/lib/catalog/import";
import { diffCatalogEvents, summarizeCatalogEvents } from "@/lib/catalog/events";
import { appendCatalogEvents } from "@/lib/catalog/events-store";
import { FeedFetchError, fetchFeed } from "@/lib/catalog/feed-fetch";
import { CATALOG_MAX_BODY_BYTES, CATALOG_RATE, enforceCatalogRate } from "@/lib/catalog/rate-limit";
import { payloadTooLarge, tooLarge } from "@/lib/ai/rate-limit";
import { emitProjectActivity } from "@/lib/activity/emit";
import { apiError, asString, badRequest, readJson, trimmedString } from "@/lib/api/route-utils";

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

  const body = await readJson<{
    content?: unknown;
    url?: unknown;
    format?: unknown;
    mode?: unknown;
    strategy?: unknown;
  }>(req);

  // Either paste feed content, or supply a URL we fetch server-side (SSRF-guarded).
  const url = trimmedString(body?.url);
  let content: string;
  if (url) {
    try {
      content = await fetchFeed(url);
    } catch (e) {
      return badRequest(e instanceof FeedFetchError ? e.message : "Feed se nepodařilo stáhnout.", "bad-request");
    }
  } else {
    content = asString(body?.content);
  }
  if (!content.trim()) return badRequest("Vložte obsah feedu nebo URL.", "missing-field");
  // ONE content-size limit for both paths. A pasted body is already rejected above by
  // tooLarge(CATALOG_MAX_BODY_BYTES); this same ceiling now also bounds a URL-fetched
  // feed (whose transport cap in feed-fetch is a separate lower-level zip-bomb guard),
  // replacing the old dead 12 MB check that sat above the 6 MB body guard.
  if (content.length > CATALOG_MAX_BODY_BYTES) return apiError(413, "Feed je příliš velký.", "content-too-long");

  const format = FORMATS.includes(body?.format as FeedFormat) ? (body!.format as FeedFormat) : undefined;
  const strategy = STRATEGIES.includes(body?.strategy as ImportStrategy)
    ? (body!.strategy as ImportStrategy)
    : "merge";
  const apply = body?.mode === "apply";

  const parsed = parseFeed(content, format);
  if (parsed.items.length === 0) {
    return Response.json({ error: "Feed neobsahuje žádné položky.", code: "provider-empty", warnings: parsed.warnings }, { status: 422 });
  }

  const now = new Date().toISOString();
  // Sanitize because the feed text is user-supplied; keep only products.
  // preserveActiveTriState: a feed that's SILENT on availability must NOT re-activate a
  // manually-paused SKU — sanitize leaves `active` unset so mergeCatalog's overlay keeps
  // the existing paused/active state (see validate.SanitizeOpts, feed.feedItemsToOfferings).
  // maxItems: MAX_FEED_ITEMS so sanitize doesn't silently pre-clip the feed below the
  // catalog cap — the one honest cap is applied at merge (see mergeCatalog).
  const incoming = sanitizeOfferings(
    feedItemsToOfferings(parsed.items, id, sourceForFormat(parsed.format), now),
    id,
    now,
    { preserveActiveTriState: true, maxItems: MAX_FEED_ITEMS }
  ).filter(isProduct) as ProductOffering[];

  // Merge against the STORED catalog (not the demo seed) so a real import stays clean.
  const current = (await listOfferings(uid, id)) ?? [];
  const { next, diff, warnings: mergeWarnings } = mergeCatalog(current, incoming, strategy, now);
  const warnings = [...parsed.warnings, ...mergeWarnings];

  if (!apply) {
    return Response.json({ ok: true, applied: false, format: parsed.format, warnings, diff });
  }

  await saveOfferings(uid, id, next);

  // The change ledger (WP W1-A): SKU-level events for what this feed actually moved.
  // Appended AFTER the save and best-effort — a ledger outage must never fail an import.
  const events = diffCatalogEvents(current, next, now, "feed-import");
  try {
    await appendCatalogEvents(uid, id, events);
  } catch (err) {
    console.error("[catalog-events] append failed (non-fatal):", err);
  }

  const summary = summarizeCatalogEvents(events);
  await emitProjectActivity(uid, id, {
    kind: "update",
    module: "katalog",
    severity: "info",
    title: "Katalog importován z feedu",
    detail: `${parsed.format} · ${next.length} položek${summary ? ` · ${summary}` : ""}`,
    actor: "Vy",
  });
  return Response.json({ ok: true, applied: true, format: parsed.format, warnings, diff, offerings: next, count: next.length });
}
