/** CRM ingestion — POST connector events into the lead layer.
 *
 *  Today two connectors are accepted: `manual` (one hand-entered enquiry) and `csv`
 *  (a pasted / uploaded export — also the LinkedIn day-one path, since Campaign
 *  Manager's lead download needs no approvals). Both converge on the SAME
 *  `applyLeadEvent` pipeline, so both get identical dedup, auto-merge and scoring,
 *  and re-posting the same payload is a no-op rather than a duplicate storm.
 *
 *  An unimplemented connector id is refused with an honest 501 instead of being
 *  silently degraded — degrade-at-write applies to STORED ids, not to a request
 *  asking us to do something we cannot do.
 *
 *  Per-user, ownership-checked, rate-limited. Server-only. No LLM call. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import {
  apiError,
  asString,
  enforceUserRate,
  readJson,
  trimmedString,
  WORKSPACE_RATE,
} from "@/lib/api/route-utils";
import { tooLarge } from "@/lib/ai/rate-limit";
import { envInt } from "@/lib/env";
import { applyLeadEvent, newLeadId } from "@/lib/leads/apply";
import { manualLeadEvent } from "@/lib/leads/connectors/manual";
import { parseContactCsv, stageFromCsvCell } from "@/lib/leads/connectors/csv";
import { leadConnectorFor } from "@/lib/leads/connectors/registry";
import { isPipelineStage } from "@/lib/leads/types";

const MAX_TEXT_BYTES = 512_000;
const MAX_BODY_BYTES = envInt("CRM_EVENTS_MAX_BODY_BYTES", 1_000_000);
/** How many rows one request may apply. Bounded because each row is a store
 *  round-trip and this runs inside a serverless request budget. */
const MAX_ROWS = envInt("CRM_EVENTS_MAX_ROWS", 500);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  if (tooLarge(req, MAX_BODY_BYTES)) {
    return apiError(413, "Import je příliš velký.", "content-too-long", { envelope: "ok" });
  }
  const limited = enforceUserRate(
    uid,
    WORKSPACE_RATE.leadsImport(),
    "Příliš mnoho importů. Zkuste to prosím za chvíli."
  );
  if (limited) return limited;

  const body = await readJson<{
    connectorId?: unknown;
    text?: unknown;
    importId?: unknown;
    defaultStage?: unknown;
    lead?: unknown;
  }>(req);
  if (!body) return apiError(400, "Neplatné tělo požadavku.", "bad-request", { envelope: "ok" });

  const connectorId = trimmedString(body.connectorId) || "csv";
  const connector = leadConnectorFor(connectorId);
  if (!connector) {
    return apiError(400, "Neznámý konektor.", "provider-unknown", { envelope: "ok" });
  }
  if (!connector.meta.implemented) {
    return apiError(501, "Tento konektor zatím neumíme.", "provider-unavailable", { envelope: "ok" });
  }

  const now = new Date();
  const defaultStageRaw = trimmedString(body.defaultStage);
  const defaultStage = isPipelineStage(defaultStageRaw) ? defaultStageRaw : "new";

  if (connectorId === "manual") {
    const lead = (body.lead ?? {}) as Record<string, unknown>;
    const name = trimmedString(lead.name);
    const email = trimmedString(lead.email);
    const phone = trimmedString(lead.phone);
    if (!name && !email && !phone) {
      return apiError(400, "Zadejte alespoň jméno, e-mail nebo telefon.", "missing-field", { envelope: "ok" });
    }
    const event = manualLeadEvent(
      project.id,
      trimmedString(body.importId) || newLeadId("sub"),
      {
        name,
        email,
        phone,
        note: trimmedString(lead.note),
        source: trimmedString(lead.source),
        campaign: trimmedString(lead.campaign),
      },
      now
    );
    const result = await applyLeadEvent(project.id, event, { now, initialStage: defaultStage });
    return Response.json({
      ok: true,
      applied: result.outcome === "rejected" || result.outcome === "duplicate" ? 0 : 1,
      duplicates: result.outcome === "duplicate" ? 1 : 0,
      rejected: result.outcome === "rejected" ? 1 : 0,
      contactId: result.contact?.id ?? null,
    });
  }

  // --- csv -------------------------------------------------------------------
  const text = asString(body.text);
  if (text.length > MAX_TEXT_BYTES) {
    return apiError(413, "Import je příliš velký.", "content-too-long", { envelope: "ok" });
  }
  if (!text.trim()) {
    return apiError(400, "Vložte data k importu.", "missing-field", { envelope: "ok" });
  }

  // The importId is what makes a re-upload idempotent: the same file re-imported
  // under the same id resolves to the same `${importId}:${rowIndex}` dedup keys.
  const importId = trimmedString(body.importId) || newLeadId("imp");
  const parsed = parseContactCsv(text, {
    projectId: project.id,
    importId,
    receivedAt: now.toISOString(),
  });
  if (parsed.events.length === 0) {
    return apiError(
      422,
      "Nenašel jsem žádné kontakty. Formát: jméno, e-mail, telefon, firma, zdroj, fáze, datum, poznámka.",
      "unprocessable",
      { envelope: "ok" }
    );
  }

  let applied = 0;
  let duplicates = 0;
  let rejected = 0;
  for (const event of parsed.events.slice(0, MAX_ROWS)) {
    // Honour a stage the export already carries rather than parking every row in
    // "new" — an imported won deal is not a fresh enquiry.
    const raw = (event.raw as { stage?: string } | undefined)?.stage;
    const stage = stageFromCsvCell(raw) ?? defaultStage;
    const result = await applyLeadEvent(project.id, event, { now, initialStage: stage });
    if (result.outcome === "duplicate") duplicates += 1;
    else if (result.outcome === "rejected") rejected += 1;
    else applied += 1;
  }

  return Response.json({
    ok: true,
    importId,
    rows: parsed.rows,
    applied,
    duplicates,
    rejected,
    skipped: parsed.skipped,
    truncated: parsed.events.length > MAX_ROWS,
  });
}
