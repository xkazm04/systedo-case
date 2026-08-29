/** Manage a project's TWIN INTAKE ENDPOINTS (WP W3-D) — the authed half of the public
 *  `/api/twin/inbound/{token}` surface.
 *
 *    GET    → the project's endpoints (address + channel + age; the secret NEVER again)
 *    POST   → mint / re-mint one channel's endpoint, returning `{ url, secret }` ONCE
 *    DELETE → revoke one channel's endpoint (`?channel=`); the public URL 404s at once
 *
 *  Every verb goes through `requireOwnedProject` (ADR-0002), so the `(userId, projectId,
 *  channel)` triple the token row is written with is the OWNER'S — never anything the
 *  wire supplied. That is exactly what lets the public intake route trust the stored row
 *  and ask no questions of its caller.
 *
 *  SHOW-ONCE. The signing secret exists in plaintext for the length of the POST response
 *  and nowhere else: it is minted, encrypted, stored, returned, and forgotten. GET
 *  reports `hasSecret: true` and no bytes. Nothing here logs it, and a re-mint is the
 *  only way to obtain a new one — which deliberately breaks the old address, because a
 *  secret an operator has lost is a secret they cannot verify signatures with anyway.
 *
 *  Mint and revoke are recorded in the project's activity feed: an intake address
 *  changing hands is exactly the kind of event that has to be datable later. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { apiError, badRequest, enforceUserRate, WORKSPACE_RATE } from "@/lib/api/route-utils";
import { emitProjectActivity } from "@/lib/activity/emit";
import { isTwinChannel, type TwinChannel } from "@/lib/twin/types";
import { metaVerifyToken } from "@/lib/twin/inbound";
import {
  clearInboundTokens,
  hasInboundCrypto,
  inboundPath,
  listInboundTokens,
  mintInboundToken,
  publicInboundToken,
  revokeInboundToken,
} from "@/lib/twin/inbound-store";

function channelParam(req: Request): TwinChannel | null {
  const raw = new URL(req.url).searchParams.get("channel");
  return isTwinChannel(raw) ? raw : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;

  const rows = await listInboundTokens(g.uid, id);
  return Response.json({
    ok: true,
    cryptoReady: hasInboundCrypto(),
    endpoints: rows.map((r) => ({ ...publicInboundToken(r), url: inboundPath(r.token) })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;

  const limited = enforceUserRate(
    g.uid,
    WORKSPACE_RATE.twinCommit(),
    "Příliš mnoho změn. Zkuste to prosím za chvíli."
  );
  if (limited) return limited;

  const channel = channelParam(req);
  if (!channel) return badRequest("Neznámý kanál pro příjem zpráv.");

  // Fail-safe: with no server key we refuse to mint rather than keep a plaintext
  // signing secret at rest — the warehouse / webhooks 501 posture.
  if (!hasInboundCrypto()) {
    return apiError(
      501,
      "Server není nakonfigurován pro bezpečné uložení podpisového tajemství (WEBHOOK_SECRET_KEY).",
      "server-misconfigured"
    );
  }

  // Whether this is a first mint or a RE-mint decides the activity wording, so read
  // before writing — a re-mint silently breaking a live intake URL must be legible later.
  const previous = (await listInboundTokens(g.uid, id)).some((r) => r.channel === channel);
  const { row, secret } = await mintInboundToken(g.uid, id, channel);

  await emitProjectActivity(g.uid, id, {
    kind: "update",
    module: "schranka",
    severity: previous ? "warning" : "info",
    title: previous ? "Adresa pro příjem zpráv obnovena" : "Příjem zpráv zapnut",
    detail: previous
      ? "Předchozí adresa i podpisové tajemství přestaly platit — nahraďte je u odesílatele."
      : "Zprávy z tohoto kanálu teď mohou padat rovnou do Schránky.",
    actor: "Vy",
  });

  // The ONLY moment the plaintext secret leaves the server. `verifyToken` is derived
  // from it (SHA-256) for Meta's subscribe handshake, so the operator never has to
  // paste the signing secret itself into a platform dashboard.
  return Response.json({
    ok: true,
    replaced: previous,
    endpoint: { ...publicInboundToken(row), url: inboundPath(row.token) },
    secret,
    verifyToken: metaVerifyToken(secret),
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;

  const channel = channelParam(req);
  // No `?channel=` revokes the lot — the shape the project-settings "turn intake off"
  // control needs, and the same call the delete cascade makes.
  if (!channel) {
    await clearInboundTokens(g.uid, id);
    await emitProjectActivity(g.uid, id, {
      kind: "update",
      module: "schranka",
      severity: "warning",
      title: "Příjem zpráv vypnut",
      detail: "Všechny adresy pro příjem přestaly platit.",
      actor: "Vy",
    });
    return Response.json({ ok: true, revoked: true });
  }

  const revoked = await revokeInboundToken(g.uid, id, channel);
  if (revoked) {
    await emitProjectActivity(g.uid, id, {
      kind: "update",
      module: "schranka",
      severity: "warning",
      title: "Adresa pro příjem zpráv zrušena",
      detail: "Odesílatel začne dostávat 404; zprávy už nedorazí.",
      actor: "Vy",
    });
  }
  // `revoked:false` is the honest answer to "delete something that was not there" — not
  // an error, but not a claim that an address was taken down either.
  return Response.json({ ok: true, revoked });
}
