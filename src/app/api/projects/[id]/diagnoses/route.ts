/** Persist + track a project's AI diagnoses (LTV cohort + lead-source root cause).
 *  A diagnosis is produced by the shared /api/ai tool on the client; this
 *  per-project sub-resource stores the result the user paid quota for, lists the
 *  capped history, and moves a diagnosis through its status lifecycle — so a paid
 *  diagnosis is a durable, actionable object, not display that evaporates on a tab
 *  close. Per-user, ownership-checked; the body is coerced to a clean, bounded
 *  payload (never trust the wire). Server-only. Mirrors the organic-channels route. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { listDiagnoses, recordDiagnosis, updateDiagnosisStatus } from "@/lib/diagnoses/store";
import {
  buildStoredDiagnosis,
  sanitizeDiagnosisInput,
  sanitizeDiagnosisKind,
  sanitizeDiagnosisStatus,
} from "@/lib/diagnoses/types";

async function requireOwnedProject(id: string) {
  const uid = await currentUserId();
  if (!uid) return { error: Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 }) };
  const project = await getProject(uid, id);
  if (!project) return { error: Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 }) };
  return { project };
}

/** List the project's saved diagnoses (newest-first), optionally one kind only. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, error } = await requireOwnedProject(id);
  if (error) return error;
  const kind = sanitizeDiagnosisKind(new URL(req.url).searchParams.get("kind")) ?? undefined;
  const items = await listDiagnoses(project!.id, kind);
  return Response.json({ ok: true, items });
}

/** Persist a freshly-run diagnosis. Body: { kind, result, inputDigest?, subject?,
 *  origin? }. Returns the stored diagnosis (with its id + status `new`). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, error } = await requireOwnedProject(id);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const input = sanitizeDiagnosisInput(body);
  if (!input) return Response.json({ ok: false, error: "Neplatná diagnóza." }, { status: 422 });

  const stored = buildStoredDiagnosis(input, () => crypto.randomUUID());
  await recordDiagnosis(project!.id, stored);
  return Response.json({ ok: true, diagnosis: stored });
}

/** Move a diagnosis through its status lifecycle. Body: { id, status }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, error } = await requireOwnedProject(id);
  if (error) return error;

  const body = (await req.json().catch(() => null)) as { id?: unknown; status?: unknown } | null;
  const diagId = typeof body?.id === "string" ? body.id : "";
  const status = sanitizeDiagnosisStatus(body?.status);
  if (!diagId || !status) {
    return Response.json({ ok: false, error: "Chybí id nebo status." }, { status: 422 });
  }
  const ok = await updateDiagnosisStatus(project!.id, diagId, status);
  if (!ok) return Response.json({ ok: false, error: "Diagnóza nenalezena." }, { status: 404 });
  return Response.json({ ok: true });
}
