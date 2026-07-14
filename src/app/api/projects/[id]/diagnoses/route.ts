/** Persist + track a project's AI diagnoses (LTV cohort + lead-source root cause).
 *  A diagnosis is produced by the shared /api/ai tool on the client; this
 *  per-project sub-resource stores the result the user paid quota for, lists the
 *  capped history, and moves a diagnosis through its status lifecycle — so a paid
 *  diagnosis is a durable, actionable object, not display that evaporates on a tab
 *  close. Per-user, ownership-checked; the body is coerced to a clean, bounded
 *  payload (never trust the wire). Server-only. Mirrors the organic-channels route. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { listDiagnoses, recordDiagnosis, updateDiagnosisStatus } from "@/lib/diagnoses/store";
import {
  buildStoredDiagnosis,
  sanitizeDiagnosisInput,
  sanitizeDiagnosisKind,
  sanitizeDiagnosisStatus,
} from "@/lib/diagnoses/types";
import { asString, readJson } from "@/lib/api/route-utils";

/** List the project's saved diagnoses (newest-first), optionally one kind only. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;
  const kind = sanitizeDiagnosisKind(new URL(req.url).searchParams.get("kind")) ?? undefined;
  const items = await listDiagnoses(project.id, kind);
  return Response.json({ ok: true, items });
}

/** Persist a freshly-run diagnosis. Body: { kind, result, inputDigest?, subject?,
 *  origin? }. Returns the stored diagnosis (with its id + status `new`). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const body = await readJson(req);
  const input = sanitizeDiagnosisInput(body);
  if (!input) return Response.json({ ok: false, error: "Neplatná diagnóza." }, { status: 422 });

  const stored = buildStoredDiagnosis(input, () => crypto.randomUUID());
  await recordDiagnosis(project.id, stored);
  return Response.json({ ok: true, diagnosis: stored });
}

/** Move a diagnosis through its status lifecycle. Body: { id, status }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const body = await readJson<{ id?: unknown; status?: unknown }>(req);
  const diagId = asString(body?.id);
  const status = sanitizeDiagnosisStatus(body?.status);
  if (!diagId || !status) {
    return Response.json({ ok: false, error: "Chybí id nebo status." }, { status: 422 });
  }
  const ok = await updateDiagnosisStatus(project.id, diagId, status);
  if (!ok) return Response.json({ ok: false, error: "Diagnóza nenalezena." }, { status: 404 });
  return Response.json({ ok: true });
}
