/** Manage the signed-in user's per-user Sklik API connection. Ownership-checked
 *  (a user only ever touches their OWN token via currentUserId), server-only.
 *   GET    → client-safe status (connected? + money-unit verdict; never the token)
 *   PUT    → connect: encrypt the API token at rest and store it
 *   PATCH  → confirm the haléře money-unit conversion (Direction 3)
 *   DELETE → disconnect
 *  The token is encrypted with the shared token-crypto (AES-256-GCM) and is never
 *  returned to the client. Follows the round-7 route conventions: the route-utils
 *  kit + stable machine `code`s alongside the human message. */
import { currentUserId } from "@/lib/session";
import { encryptToken, hasTokenCrypto } from "@/lib/inventory/token-crypto";
import {
  deleteSklikConnection,
  getSklikConnection,
  publicSklikConnection,
  saveSklikConnection,
} from "@/lib/campaigns/sklik-connection";
import { apiError, badRequest, readJson, trimmedString } from "@/lib/api/route-utils";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return apiError(401, "Nepřihlášeno.", "unauthorized");
  const conn = await getSklikConnection(userId);
  return Response.json({ connection: publicSklikConnection(conn) });
}

export async function PUT(req: Request) {
  const userId = await currentUserId();
  if (!userId) return apiError(401, "Nepřihlášeno.", "unauthorized");

  const body = await readJson<{ token?: unknown }>(req);
  const token = trimmedString(body?.token);
  if (!token) return badRequest("Zadejte Sklik API token.", "provider-no-token");
  if (!hasTokenCrypto()) {
    return apiError(
      501,
      "Server není nakonfigurován pro bezpečné uložení tokenu (CATALOG_TOKEN_SECRET).",
      "server-misconfigured"
    );
  }

  // Preserve the Direction-3 money-unit setting across a token re-entry: reconnecting
  // (e.g. rotating the token) must NOT silently reset a haléře conversion the owner
  // already confirmed. A brand-new connection starts on native CZK (the default).
  const existing = await getSklikConnection(userId);
  await saveSklikConnection(userId, {
    tokenEnc: encryptToken(token),
    connectedAt: new Date().toISOString(),
    ...(existing?.halereConfirmed
      ? { halereConfirmed: true, halereConfirmedAt: existing.halereConfirmedAt }
      : {}),
  });
  const conn = await getSklikConnection(userId);
  return Response.json({ connection: publicSklikConnection(conn) });
}

export async function PATCH(req: Request) {
  const userId = await currentUserId();
  if (!userId) return apiError(401, "Nepřihlášeno.", "unauthorized");

  const body = await readJson<{ halereConfirmed?: unknown }>(req);
  if (body?.halereConfirmed !== true) {
    return badRequest("Neznámá akce.", "invalid-type");
  }
  const conn = await getSklikConnection(userId);
  if (!conn) return apiError(404, "Sklik není připojen.", "not-found");

  // Flip the documented conversion ON — from here the connector divides Sklik money
  // by 100 (haléře → CZK) going forward. Never rewrites already-synced data.
  await saveSklikConnection(userId, {
    ...conn,
    halereConfirmed: true,
    halereConfirmedAt: new Date().toISOString(),
  });
  return Response.json({ connection: publicSklikConnection(await getSklikConnection(userId)) });
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return apiError(401, "Nepřihlášeno.", "unauthorized");
  await deleteSklikConnection(userId);
  return Response.json({ ok: true });
}
