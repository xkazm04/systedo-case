/** A2/D2/D3 — POST a rank / review / GBP export (pasted CSV or a hosted-CSV URL) to
 *  bring a local project's real signals in as the module's source of truth. One route,
 *  three sections selected by `kind` (default "ranks"): ranks feed the map ladder,
 *  reviews feed the inbox + recap sentiment, gbp feeds the locations roster. Each
 *  section carries its own provenance and lives in the same per-project blob, so an
 *  import of one never disturbs the others. Per-user, ownership-checked. Server-only. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import {
  parseRankRows,
  parseReviews,
  parseGbpRows,
  parseCoverageRows,
  mergeLadder,
  mergeCoverage,
} from "@/lib/local-signals/import";
import {
  getLocalSignals,
  saveLocalSignals,
  clearLocalSignals,
  mutateLocalSignals,
} from "@/lib/local-signals/store";
import { fetchFeed, FeedFetchError } from "@/lib/catalog/feed-fetch";
import type {
  ImportedCoverageRow,
  LocalSignals,
  LocalSignalsMeta,
  LocalSignalsSource,
} from "@/lib/local-signals/types";
import { tooLarge } from "@/lib/ai/rate-limit";
import { envInt } from "@/lib/env";
import { apiError, asString, enforceUserRate, readJson, trimmedString, WORKSPACE_RATE } from "@/lib/api/route-utils";

const MAX_BYTES = 256_000;
/** Pre-parse content-length cap — see the leads import route for the rationale. */
const MAX_BODY_BYTES = envInt("LOCAL_SIGNALS_MAX_BODY_BYTES", 512_000);
type Kind = "ranks" | "reviews" | "gbp" | "coverage";

function isKind(v: unknown): v is Kind {
  return v === "ranks" || v === "reviews" || v === "gbp" || v === "coverage";
}

/** The top-level meta represents the LADDER section (kept for backward compat). When a
 *  non-rank import lands with no ladder yet, we still need a meta — a rowCount-0
 *  placeholder that the resolver ignores (it falls back to the sample ladder). */
function ladderMeta(prev: LocalSignals | null, source: LocalSignalsSource, url: string): LocalSignalsMeta {
  if (prev && prev.ladder.length > 0) return prev.meta;
  return { source, syncedAt: new Date().toISOString(), rowCount: 0, ...(url ? { sourceUrl: url } : {}) };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  // Reject an oversized body up front, then throttle before the fetch/parse work
  // (this route can fetch a hosted CSV — an outbound call worth rate-limiting).
  if (tooLarge(req, MAX_BODY_BYTES)) return apiError(413, "Import je příliš velký.", "content-too-long", { envelope: "ok" });
  const limited = enforceUserRate(uid, WORKSPACE_RATE.localSignalsImport(), "Příliš mnoho importů. Zkuste to prosím za chvíli.");
  if (limited) return limited;

  const body = await readJson<{ text?: unknown; url?: unknown; kind?: unknown; rows?: unknown }>(req);
  const kind: Kind = isKind(body?.kind) ? body.kind : "ranks";
  const url = trimmedString(body?.url);

  // Two honest ingestion paths: pasted CSV, or a fetch of a hosted CSV the user
  // controls (a published Sheet / export) — the connector seam a paid provider could
  // later plug into. No pretend live API.
  let text: string;
  let source: LocalSignalsSource;
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
    source = kind === "gbp" ? "gbp" : "import";
  }
  if (text.length > MAX_BYTES) {
    return apiError(413, "Import je příliš velký.", "content-too-long", { envelope: "ok" });
  }

  const now = new Date().toISOString();
  const meta = (rowCount: number): LocalSignalsMeta => ({
    source,
    syncedAt: now,
    rowCount,
    ...(source === "url" ? { sourceUrl: url } : {}),
  });

  // Every section persists through an ATOMIC read-modify-write (D2): the prev blob is
  // read and the next written in ONE transaction, so a concurrent import of a DIFFERENT
  // section can no longer read the same base and clobber this one's write.
  if (kind === "reviews") {
    const { items, ambiguous } = parseReviews(text);
    if (items.length === 0) {
      const msg =
        ambiguous > 0
          ? `Nenašel jsem žádné použitelné recenze — ${ambiguous} řádků mělo nejednoznačné datum (den/měsíc). Použijte formát RRRR-MM-DD.`
          : "Nenašel jsem žádné recenze. Formát: autor, hodnocení, text, datum, oblast.";
      return apiError(400, msg, "unprocessable", { envelope: "ok" });
    }
    await mutateLocalSignals(project.id, (prev) => ({
      meta: ladderMeta(prev, source, url),
      ladder: prev?.ladder ?? [],
      ...(prev?.gbp ? { gbp: prev.gbp } : {}),
      ...(prev?.coverage ? { coverage: prev.coverage } : {}),
      reviews: { meta: meta(items.length), items },
    }));
    return Response.json({ ok: true, rowCount: items.length, ...(ambiguous > 0 ? { ambiguous } : {}) });
  }

  if (kind === "gbp") {
    const rows = parseGbpRows(text);
    if (rows.length === 0) {
      return apiError(400, "Nenašel jsem žádné pobočky. Formát: pobočka, stav, počet recenzí, hodnocení, nezodpovězené.", "unprocessable", { envelope: "ok" });
    }
    await mutateLocalSignals(project.id, (prev) => ({
      meta: ladderMeta(prev, source, url),
      ladder: prev?.ladder ?? [],
      ...(prev?.reviews ? { reviews: prev.reviews } : {}),
      ...(prev?.coverage ? { coverage: prev.coverage } : {}),
      gbp: { meta: meta(rows.length), rows },
    }));
    return Response.json({ ok: true, rowCount: rows.length });
  }

  if (kind === "coverage") {
    // Two feeds share this section: a tolerant CSV (service, locality, hasPage) and a
    // single-cell manual toggle (a structured `rows` payload). Both UNION-merge onto the
    // stored coverage so a partial upload or one toggled cell never drops the rest.
    const rows: ImportedCoverageRow[] = Array.isArray(body?.rows)
      ? (body.rows as unknown[])
          .map((r) => {
            const o = r as { service?: unknown; locality?: unknown; hasPage?: unknown };
            return { service: trimmedString(o?.service), locality: trimmedString(o?.locality), hasPage: o?.hasPage === true };
          })
          .filter((r) => r.service && r.locality)
      : parseCoverageRows(text);
    if (rows.length === 0) {
      return apiError(400, "Nenašel jsem žádné pokrytí. Formát: služba, lokalita, má stránku (ano/ne).", "unprocessable", { envelope: "ok" });
    }
    await mutateLocalSignals(project.id, (prev) => {
      const merged = mergeCoverage(prev?.coverage?.rows ?? [], rows);
      return {
        meta: ladderMeta(prev, source, url),
        ladder: prev?.ladder ?? [],
        ...(prev?.reviews ? { reviews: prev.reviews } : {}),
        ...(prev?.gbp ? { gbp: prev.gbp } : {}),
        coverage: { meta: meta(merged.length), rows: merged },
      };
    });
    return Response.json({ ok: true, rowCount: rows.length });
  }

  // kind === "ranks": UNION-merge onto the previously-imported ladder so per-keyword
  // rank history accumulates across monthly imports (the climb/trend/best the module
  // exists to show) AND a subset re-import never drops omitted keywords (they are kept
  // and flagged 'untracked'), instead of resetting to a single point on every upload.
  const rows = parseRankRows(text);
  if (rows.length === 0) {
    return apiError(400, "Nenašel jsem žádné pozice. Formát: klíčové slovo, oblast, pozice.", "unprocessable", { envelope: "ok" });
  }
  await mutateLocalSignals(project.id, (prev) => ({
    meta: meta(rows.length),
    ladder: mergeLadder(prev?.ladder ?? [], rows, now),
    ...(prev?.reviews ? { reviews: prev.reviews } : {}),
    ...(prev?.gbp ? { gbp: prev.gbp } : {}),
    ...(prev?.coverage ? { coverage: prev.coverage } : {}),
  }));
  return Response.json({ ok: true, rowCount: rows.length });
}

/** Revert to the illustrative sample. `?source=ranks|reviews|gbp` reverts just that
 *  section (dropping the rest of the blob only when nothing live remains); no param
 *  clears everything. Per-source revert keeps the other live imports intact. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const source = new URL(req.url).searchParams.get("source");
  if (source === "reviews" || source === "gbp" || source === "ranks" || source === "coverage") {
    const prev = await getLocalSignals(project.id);
    if (!prev) return Response.json({ ok: true });
    const next: LocalSignals = {
      meta: prev.meta,
      ladder: source === "ranks" ? [] : prev.ladder,
      ...(source !== "reviews" && prev.reviews ? { reviews: prev.reviews } : {}),
      ...(source !== "gbp" && prev.gbp ? { gbp: prev.gbp } : {}),
      ...(source !== "coverage" && prev.coverage ? { coverage: prev.coverage } : {}),
    };
    // Nothing live left → drop the whole blob so the project cleanly reads as sample.
    if (next.ladder.length === 0 && !next.reviews && !next.gbp && !next.coverage) {
      await clearLocalSignals(project.id);
    } else {
      await saveLocalSignals(project.id, next);
    }
    return Response.json({ ok: true });
  }

  await clearLocalSignals(project.id);
  return Response.json({ ok: true });
}
