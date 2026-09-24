/** The project's webhook delivery log. Per-user, ownership-checked, server-only.
 *
 *  GET `?limit=` returns the newest deliveries as the client-safe view: the signed
 *  PAYLOAD is replaced by its byte size. The payload is not a secret, but it is the
 *  whole alert body repeated per endpoint — shipping it into a settings page would
 *  make a 500-row log a multi-megabyte response for no rendered benefit.
 *
 *  DELETE clears the log. It does NOT touch the endpoint configuration (that is the
 *  sibling route) — clearing history and disconnecting are different intentions and
 *  a settings page must not conflate them.
 *
 *  POST `{ redeliver: <deliveryId> }` replays one settled delivery — the dead-letter
 *  verb. The row is looked up by `(owned projectId, id)`, so another project's id is a
 *  404 (ADR-0002); a row the queue still owns (`pending`, `sending`) is a 409, as is one
 *  whose endpoint was deleted or switched off. A NEW row is appended with the original's
 *  verbatim signed payload and event id (`redeliveryOf` names the original, which stays
 *  as history) and drained once, in-request, through the same claim + attemptDelivery
 *  path as every delivery — the same guard, the same signature. It POSTs only to the
 *  owner's own registered endpoint at the owner's click, and shares the test route's
 *  per-user bucket, so it is no more of an amplifier than "Send test". */
import { randomUUID } from "node:crypto";
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { badRequest, conflict, enforceUserRate, notFound, readJson } from "@/lib/api/route-utils";
import { getWebhookConfig } from "@/lib/outbound/config-store";
import {
  appendDelivery,
  clearDeliveries,
  getDelivery,
  listDeliveries,
} from "@/lib/outbound/delivery-store";
import { drainDeliveries } from "@/lib/outbound/drain";
import { buildRedelivery, canRedeliver } from "@/lib/outbound/endpoint-health";
import { publicDelivery } from "@/lib/outbound/types";

/** Page size, and the ceiling a caller-supplied `?limit=` is clamped to. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** The SAME bucket as the test route (webhooks/test): a redeliver and a test are both
 *  an on-demand POST to the owner's receiver, so they share one 6/min allowance. */
const SEND_RATE = { bucket: "webhooks:test", limit: 6, windowMs: 60_000 };

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;

  const limited = enforceUserRate(auth.uid, SEND_RATE, "Příliš mnoho odeslání. Zkuste to prosím za chvíli.");
  if (limited) return limited;

  const body = await readJson<{ redeliver?: unknown }>(req);
  const target = typeof body?.redeliver === "string" ? body.redeliver.trim() : "";
  if (!target) return badRequest("Chybí id doručení (redeliver).", "missing-field");

  const orig = await getDelivery(id, target);
  if (!orig || orig.userId !== auth.uid) return notFound("Doručení nenalezeno.", "not-found");
  if (!canRedeliver(orig)) {
    return conflict("Doručení ještě vyřizuje fronta; znovu ho lze odeslat, až skončí.");
  }
  const cfg = await getWebhookConfig(auth.uid, id);
  const endpoint = cfg.endpoints.find((e) => e.id === orig.endpointId);
  if (!endpoint) return conflict("Cíl tohoto doručení byl smazán.");
  if (!endpoint.enabled) return conflict("Cíl tohoto doručení je vypnutý. Zapněte ho a zkuste to znovu.");

  const now = new Date();
  const row = buildRedelivery(orig, { id: randomUUID(), now });
  await appendDelivery(row);
  await drainDeliveries({ candidates: [row], now, stamp: true });
  const settled = (await getDelivery(id, row.id)) ?? row;
  return Response.json({ delivery: publicDelivery(settled) });
}
