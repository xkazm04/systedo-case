/** WP W3-A — the project's advice ledger as a resource: what the app recommended,
 *  when it was shown, and how it turned out. Per-user, ownership-checked
 *  (`requireOwnedProject`, ADR-0002); the body is coerced to a bounded payload, never
 *  trusted from the wire. Server-only. Mirrors the diagnoses route's PATCH shape.
 *
 *  WHAT A CLIENT MAY AND MAY NOT DO. The ledger's `project_state` key is `http: false`
 *  — a browser cannot PUT the blob through the generic state route, because the
 *  outcomes on it are a MEASUREMENT and a client that could rewrite them could write
 *  itself any result it liked. This route is the narrow, per-record exception: it
 *  moves ONE known subject between `dismissed` and `open` and nothing else.
 *  `resolved` is refused with a 422 by construction — it is machine-minted alongside
 *  the outcome that justifies it, and a client-set "resolved" would be a verdict with
 *  no measurement behind it. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { getAdviceLedger, setAdviceSubjectStatus } from "@/lib/advice/store";
import { apiError, asString, readJson } from "@/lib/api/route-utils";

/** The project's ledger. Empty (never null) when nothing has been tracked yet, so the
 *  client renders "nothing measured" rather than branching on a missing body. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const ledger = await getAdviceLedger(g.uid, g.project.id);
  return Response.json({ ok: true, ledger: ledger ?? { records: [], updatedAt: "" } });
}

/** Dismiss one subject, or undo the dismissal. Body: `{ subjectKey, status }` with
 *  status in `"dismissed" | "open"`. 422 on a missing field or any other status
 *  (including "resolved"), 404 when the ledger has never seen that subject. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;

  const body = await readJson<{ subjectKey?: unknown; status?: unknown }>(req);
  const subjectKey = asString(body?.subjectKey);
  const status = body?.status;
  if (!subjectKey || (status !== "dismissed" && status !== "open")) {
    return apiError(422, "Chybí subjectKey nebo neplatný status.", "unprocessable", {
      envelope: "ok",
    });
  }
  const record = await setAdviceSubjectStatus(g.uid, g.project.id, subjectKey, status, new Date());
  if (!record) return apiError(404, "Doporučení nenalezeno.", "not-found", { envelope: "ok" });
  return Response.json({ ok: true, record });
}
