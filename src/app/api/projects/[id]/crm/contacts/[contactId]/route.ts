/** One CRM contact — read with timeline, patch (stage / fields), GDPR erase.
 *
 *  Per-user, ownership-checked. Server-only. No LLM call: lead PII must not reach
 *  `generateStructured` (docs/leads/design.md §B7). */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { apiError, readJson, trimmedString } from "@/lib/api/route-utils";
import { getContact, listActivities } from "@/lib/leads/store";
import { changeConsent, changeStage, eraseContact, patchContact } from "@/lib/leads/mutate";
import {
  CONSENT_PURPOSES,
  LAWFUL_BASES,
  isLostReason,
  isPipelineStage,
  isErased,
  type ConsentPurpose,
  type LawfulBasis,
} from "@/lib/leads/types";

const TIMELINE_LIMIT = 200;

/** GET — the contact plus its timeline (newest first). A tombstoned contact is
 *  reported as erased rather than rendered as a person. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const { id, contactId } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;

  const contact = await getContact(g.project.id, contactId);
  if (!contact) return apiError(404, "Kontakt nenalezen.", "not-found", { envelope: "ok" });
  if (isErased(contact)) {
    return Response.json({ ok: true, contact, timeline: [], erased: true });
  }
  const timeline = await listActivities(g.project.id, contactId, TIMELINE_LIMIT);
  return Response.json({ ok: true, contact, timeline, erased: false });
}

/** PATCH — move the stage and/or edit fields.
 *
 *  A stage move ALWAYS appends a `stage_change` activity (that is what makes
 *  time-in-stage and real velocity computable); moving to a terminal negative
 *  requires a preset `reason`, because loss reasons are counted, not narrated. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const { id, contactId } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return apiError(400, "Neplatné tělo požadavku.", "bad-request", { envelope: "ok" });

  let contact = await getContact(project.id, contactId);
  if (!contact) return apiError(404, "Kontakt nenalezen.", "not-found", { envelope: "ok" });
  if (isErased(contact)) {
    return apiError(409, "Kontakt byl smazán na žádost subjektu údajů.", "conflict", { envelope: "ok" });
  }

  const now = new Date();

  if (body.stage !== undefined) {
    const stage = trimmedString(body.stage);
    if (!isPipelineStage(stage)) {
      return apiError(422, "Neznámá fáze.", "invalid-type", { envelope: "ok" });
    }
    const reasonRaw = trimmedString(body.reason);
    const reason = isLostReason(reasonRaw) ? reasonRaw : undefined;
    if ((stage === "lost" || stage === "disqualified") && !reason) {
      return apiError(422, "U ztraceného leadu vyberte důvod.", "missing-field", { envelope: "ok" });
    }
    contact = await changeStage(
      project.id,
      contact,
      { to: stage, ...(reason ? { reason } : {}), note: trimmedString(body.note) || undefined, actorId: uid },
      now
    );
  }

  // WP S2 — the CONSENT decision. Its own key rather than a field edit, because it is
  // append-only history with a lawful basis, not a mutable property — and because it
  // is what lets the twin's `consentRequired` delivery gate ever open. Both the
  // purpose and the basis are checked against their closed unions: a typo'd purpose
  // would write a record that no `mayContact` lookup will ever find, which reads as a
  // grant to the operator and refuses forever in practice.
  if (body.consent !== undefined) {
    const c = (body.consent ?? {}) as Record<string, unknown>;
    const purpose = trimmedString(c.purpose);
    const basis = trimmedString(c.basis) || "consent";
    if (!(CONSENT_PURPOSES as readonly string[]).includes(purpose)) {
      return apiError(422, "Neznámý účel souhlasu.", "invalid-type", { envelope: "ok" });
    }
    if (!(LAWFUL_BASES as readonly string[]).includes(basis)) {
      return apiError(422, "Neznámý právní základ.", "invalid-type", { envelope: "ok" });
    }
    if (typeof c.granted !== "boolean") {
      return apiError(422, "Pole „granted“ musí být true/false.", "invalid-type", { envelope: "ok" });
    }
    contact = await changeConsent(
      project.id,
      contact,
      {
        purpose: purpose as ConsentPurpose,
        basis: basis as LawfulBasis,
        granted: c.granted,
        ...(trimmedString(c.evidenceText) ? { evidenceText: trimmedString(c.evidenceText) } : {}),
        actorId: uid,
      },
      now
    );
  }

  const hasFieldEdit = ["name", "email", "phone", "companyName", "notes", "tags", "ownerId", "firstRespondedAt"].some(
    (k) => body[k] !== undefined
  );
  if (hasFieldEdit) {
    contact = await patchContact(
      project.id,
      contact,
      {
        ...(body.name !== undefined ? { name: trimmedString(body.name) } : {}),
        ...(body.email !== undefined ? { email: trimmedString(body.email) } : {}),
        ...(body.phone !== undefined ? { phone: trimmedString(body.phone) } : {}),
        ...(body.companyName !== undefined ? { companyName: trimmedString(body.companyName) } : {}),
        ...(body.notes !== undefined ? { notes: trimmedString(body.notes) } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.ownerId !== undefined ? { ownerId: trimmedString(body.ownerId) } : {}),
        ...(body.firstRespondedAt !== undefined ? { firstRespondedAt: now.toISOString() } : {}),
      },
      now
    );
  }

  return Response.json({ ok: true, contact });
}

/** DELETE — GDPR Art. 17 erasure. Hard-clears the PII and the whole timeline and
 *  leaves a TOMBSTONE, so the person is gone but the anonymous funnel counts in
 *  Kvalita leadů do not silently change (Art. 17 does not require destroying
 *  anonymous statistics). This is deliberately NOT a row delete. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const { id, contactId } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;

  const contact = await getContact(g.project.id, contactId);
  if (!contact) return apiError(404, "Kontakt nenalezen.", "not-found", { envelope: "ok" });
  if (isErased(contact)) return Response.json({ ok: true, contact, alreadyErased: true });

  const body = await readJson<{ reason?: unknown }>(req);
  const reason = trimmedString(body?.reason) || "gdpr-erasure";
  const tombstone = await eraseContact(g.project.id, contact, reason);
  return Response.json({ ok: true, contact: tombstone, erased: true });
}
