/** Manage a project's outbound webhook endpoints. Per-user, ownership-checked,
 *  server-only.
 *
 *  GET returns the client-safe list (no secret bytes, ever). PUT REPLACES the list,
 *  minting a signing secret for each new endpoint and returning it EXACTLY ONCE in
 *  `secrets` — that response is the only moment the plaintext exists outside the
 *  encrypted blob, so the UI shows it in a reveal-once banner and nothing can read it
 *  back. DELETE drops one endpoint (`?endpointId=`) or the whole configuration.
 *
 *  Every URL is validated against the SSRF guard here so the owner gets an immediate
 *  error — but the guard that matters runs again inside the sender on every single
 *  attempt (DNS can be re-pointed after a save; see src/lib/outbound/send.ts). */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { apiError, badRequest, readJson, unprocessable } from "@/lib/api/route-utils";
import { rateLimit, tooManyRequests } from "@/lib/ai/rate-limit";
import { emitProjectActivity } from "@/lib/activity/emit";
import { randomUUID } from "node:crypto";
import {
  clearWebhookConfig,
  getWebhookConfig,
  saveWebhookConfig,
} from "@/lib/outbound/config-store";
import { clearDeliveries } from "@/lib/outbound/delivery-store";
import { parseEndpointsInput } from "@/lib/outbound/config-input";
import {
  encryptSecret,
  hasWebhookCrypto,
  mintWebhookSecret,
} from "@/lib/outbound/secret-crypto";
import { publicEndpoint, type WebhookEndpoint } from "@/lib/outbound/types";

/** Per-user write throttle. A save is cheap, but each one can re-point where the
 *  server will POST unattended for hours — worth a bucket of its own. */
const SAVE_RATE = { bucket: "webhooks:save", limit: 20, windowMs: 60_000 };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;
  const cfg = await getWebhookConfig(auth.uid, id);
  return Response.json({
    endpoints: cfg.endpoints.map(publicEndpoint),
    cryptoReady: hasWebhookCrypto(),
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;

  const limited = rateLimit(`user:${auth.uid}`, [SAVE_RATE]);
  if (!limited.ok) {
    return tooManyRequests(limited.retryAfter, "Příliš mnoho změn. Zkuste to prosím za chvíli.");
  }

  // Fail-safe: with no server key we refuse to store an endpoint rather than keep a
  // plaintext signing secret at rest — the warehouse route's 501 posture.
  if (!hasWebhookCrypto()) {
    return apiError(
      501,
      "Server není nakonfigurován pro bezpečné uložení podpisového tajemství (WEBHOOK_SECRET_KEY).",
      "server-misconfigured"
    );
  }

  const parsed = parseEndpointsInput(await readJson(req));
  if (!parsed.ok) {
    return parsed.code === "bad-request" ? badRequest(parsed.error) : unprocessable(parsed.error);
  }

  const existing = await getWebhookConfig(auth.uid, id);
  const byId = new Map(existing.endpoints.map((e) => [e.id, e]));
  const now = new Date().toISOString();
  const secrets: Record<string, string> = {};
  const endpoints: WebhookEndpoint[] = [];
  for (const input of parsed.endpoints) {
    const prior = input.id ? byId.get(input.id) : undefined;
    const endpointId = prior?.id ?? randomUUID();
    // A secret is minted for a NEW endpoint, or when the owner explicitly rotates.
    // Editing a URL or a filter deliberately does NOT rotate: a receiver's pinned
    // secret would otherwise break with no warning.
    let secretEnc = prior?.secretEnc ?? "";
    if (!prior || input.rotate) {
      const plain = mintWebhookSecret();
      secretEnc = encryptSecret(plain);
      secrets[endpointId] = plain;
    }
    endpoints.push({
      id: endpointId,
      url: input.url,
      events: input.events,
      enabled: input.enabled,
      secretEnc,
      createdAt: prior?.createdAt ?? now,
      ...(prior?.lastDeliveryAt ? { lastDeliveryAt: prior.lastDeliveryAt } : {}),
      ...(prior?.lastStatus ? { lastStatus: prior.lastStatus } : {}),
    });
  }

  await saveWebhookConfig(auth.uid, id, { endpoints });
  await emitProjectActivity(auth.uid, id, {
    kind: "update",
    module: "nastaveni",
    severity: "success",
    title: "Webhooky upraveny",
    detail: `${endpoints.length} cílů`,
    actor: "Vy",
  });
  return Response.json({ endpoints: endpoints.map(publicEndpoint), secrets });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;

  const endpointId = new URL(req.url).searchParams.get("endpointId");
  if (endpointId) {
    const cfg = await getWebhookConfig(auth.uid, id);
    const endpoints = cfg.endpoints.filter((e) => e.id !== endpointId);
    await saveWebhookConfig(auth.uid, id, { endpoints });
    return Response.json({ ok: true, endpoints: endpoints.map(publicEndpoint) });
  }

  // No id → drop the whole configuration AND its log. Pending deliveries whose
  // endpoint just disappeared are closed by the retry step as orphans, so nothing
  // keeps retrying against a config that no longer exists.
  await clearWebhookConfig(auth.uid, id);
  await clearDeliveries(id);
  return Response.json({ ok: true, endpoints: [] });
}
