/** CRM contacts — list + create.
 *
 *  NAMESPACE NOTE: this lives under `/api/projects/[id]/crm/**`, not `/leads/**`.
 *  `/api/projects/[id]/leads/import` already exists and belongs to the AGGREGATE
 *  funnel importer (lead-quality) — hanging `/leads/contacts` off the same prefix
 *  would put two different meanings of "lead" on one namespace.
 *
 *  Per-user, ownership-checked through the shared guard. Server-only. No LLM call
 *  anywhere in this namespace: lead PII must not reach `generateStructured`, which
 *  mirrors traffic to LightTrack (docs/leads/design.md §B7). */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { apiError, readJson, trimmedString, enforceUserRate, WORKSPACE_RATE } from "@/lib/api/route-utils";
import { resolveContacts } from "@/lib/leads/resolve";
import { applyLeadEvent, newLeadId } from "@/lib/leads/apply";
import { manualLeadEvent } from "@/lib/leads/connectors/manual";
import { isPipelineStage } from "@/lib/leads/types";
import type { ContactQuery } from "@/lib/leads/store";

const MAX_LIMIT = 200;

/** GET /api/projects/[id]/crm/contacts?stage=&q=&limit=&offset=
 *  Returns the resolved set: the project's real contacts when it has any, else the
 *  seeded sample with `live: false` so the UI can label it honestly. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const url = new URL(req.url);
  const stageParam = url.searchParams.get("stage");
  const query: ContactQuery = {
    ...(stageParam && isPipelineStage(stageParam) ? { stage: stageParam } : {}),
    search: url.searchParams.get("q") ?? undefined,
    limit: clampNumber(url.searchParams.get("limit"), 1, MAX_LIMIT, 100),
    offset: clampNumber(url.searchParams.get("offset"), 0, 100_000, 0),
  };

  const resolved = await resolveContacts(project, query);
  return Response.json({
    ok: true,
    contacts: resolved.contacts,
    live: resolved.live,
    source: resolved.source,
    total: resolved.total,
  });
}

/** POST /api/projects/[id]/crm/contacts — create one contact by hand.
 *
 *  Routed through the SAME `applyLeadEvent` pipeline a connector uses, so a typed
 *  contact gets identical dedup, auto-merge and scoring. A resubmitted form with
 *  the same `submissionId` is therefore a no-op, not a duplicate person. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  const limited = enforceUserRate(
    uid,
    WORKSPACE_RATE.leadsImport(),
    "Příliš mnoho zápisů. Zkuste to prosím za chvíli."
  );
  if (limited) return limited;

  const body = await readJson<{
    name?: unknown;
    email?: unknown;
    phone?: unknown;
    note?: unknown;
    source?: unknown;
    campaign?: unknown;
    stage?: unknown;
    submissionId?: unknown;
  }>(req);
  if (!body) return apiError(400, "Neplatné tělo požadavku.", "bad-request", { envelope: "ok" });

  const name = trimmedString(body.name);
  const email = trimmedString(body.email);
  const phone = trimmedString(body.phone);
  if (!name && !email && !phone) {
    return apiError(400, "Zadejte alespoň jméno, e-mail nebo telefon.", "missing-field", { envelope: "ok" });
  }

  const stage = typeof body.stage === "string" && isPipelineStage(body.stage) ? body.stage : "new";
  const submissionId = trimmedString(body.submissionId) || newLeadId("sub");
  const now = new Date();
  const event = manualLeadEvent(
    project.id,
    submissionId,
    {
      name,
      email,
      phone,
      note: trimmedString(body.note),
      source: trimmedString(body.source),
      campaign: trimmedString(body.campaign),
    },
    now
  );

  const result = await applyLeadEvent(project.id, event, { now, initialStage: stage });
  if (result.outcome === "rejected") {
    return apiError(422, "Kontakt se nepodařilo založit.", "unprocessable", { envelope: "ok" });
  }
  return Response.json({ ok: true, outcome: result.outcome, contact: result.contact });
}

function clampNumber(raw: string | null, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
