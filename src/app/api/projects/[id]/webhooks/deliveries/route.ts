/** The project's webhook delivery log. Per-user, ownership-checked, server-only.
 *
 *  GET `?limit=` returns the newest deliveries as the client-safe view: the signed
 *  PAYLOAD is replaced by its byte size. The payload is not a secret, but it is the
 *  whole alert body repeated per endpoint — shipping it into a settings page would
 *  make a 500-row log a multi-megabyte response for no rendered benefit.
 *
 *  DELETE clears the log. It does NOT touch the endpoint configuration (that is the
 *  sibling route) — clearing history and disconnecting are different intentions and
 *  a settings page must not conflate them. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { clearDeliveries, listDeliveries } from "@/lib/outbound/delivery-store";
import { publicDelivery } from "@/lib/outbound/types";

/** Page size, and the ceiling a caller-supplied `?limit=` is clamped to. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;

  const raw = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_LIMIT) : DEFAULT_LIMIT;
  const deliveries = await listDeliveries(id, limit);
  return Response.json({ deliveries: deliveries.map(publicDelivery) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;
  await clearDeliveries(id);
  return Response.json({ ok: true, deliveries: [] });
}
