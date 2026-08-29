/** Manage the project's OUTBOUND FEED TOKEN (WP W2-D) — the authed half of the public
 *  `/api/feed/{token}` surface.
 *
 *    GET    → the current token, or null when none has been minted
 *    POST   → mint (or RE-mint, which revokes the old address in the same step)
 *    DELETE → revoke; the public URL 404s immediately afterwards
 *
 *  Every verb goes through `requireOwnedProject` (ADR-0002), so the `(userId,
 *  projectId)` pair the token row is written with is the OWNER's — never anything the
 *  wire supplied. That is precisely what lets the public route trust the stored row and
 *  ask no questions of its caller.
 *
 *  The token is returned in FULL on every GET, unlike a webhook signing secret: it is a
 *  capability URL the owner has to be able to re-read and re-paste into Merchant Center
 *  / Heureka after they close the tab (see feed-token-store.ts). Mint and revoke are
 *  recorded in the project's activity feed — a feed address changing hands is exactly
 *  the kind of event a merchant needs to be able to date later. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { emitProjectActivity } from "@/lib/activity/emit";
import {
  getProjectFeedToken,
  mintFeedToken,
  revokeFeedToken,
  type FeedToken,
} from "@/lib/catalog/feed-token-store";

/** The wire shape — `createdAt` lets the panel say how old the address is. */
const publicShape = (row: FeedToken | null) =>
  row ? { token: row.token, createdAt: row.createdAt } : null;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;

  const row = await getProjectFeedToken(g.uid, id);
  return Response.json({ ok: true, token: publicShape(row) });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;

  // Whether this is the first mint or a re-mint decides the activity wording, so read
  // before writing — a re-mint silently breaking a live feed URL must be legible later.
  const previous = await getProjectFeedToken(g.uid, id);
  const row = await mintFeedToken(g.uid, id);

  await emitProjectActivity(g.uid, id, {
    kind: "update",
    module: "katalog",
    severity: previous ? "warning" : "info",
    title: previous ? "Adresa produktového feedu obnovena" : "Produktový feed zveřejněn",
    detail: previous
      ? "Předchozí adresa přestala platit — nahraďte ji v Merchant Center, Heurece i na Zboží.cz."
      : "Katalog je nově dostupný jako feed pro Google, Heureku a Zboží.cz.",
    actor: "Vy",
  });

  return Response.json({ ok: true, token: publicShape(row), replaced: previous !== null });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;

  const revoked = await revokeFeedToken(g.uid, id);
  if (revoked) {
    await emitProjectActivity(g.uid, id, {
      kind: "update",
      module: "katalog",
      severity: "warning",
      title: "Produktový feed zrušen",
      detail: "Adresa feedu přestala platit; kanály ji po svém cyklu přestanou stahovat.",
      actor: "Vy",
    });
  }

  // `revoked:false` is the honest answer to "delete something that was not there" —
  // not an error, but not a claim that an address was taken down either.
  return Response.json({ ok: true, revoked, token: null });
}
