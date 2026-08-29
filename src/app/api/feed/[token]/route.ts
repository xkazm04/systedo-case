/** THE PUBLIC OUTBOUND PRODUCT FEED (WP W2-D).
 *
 *    GET /api/feed/{token}?format=google|heureka|zbozi
 *
 *  Deliberately ANONYMOUS, and that is the whole design rather than an oversight: this
 *  URL is pulled by Google Merchant / Heureka / Zboží.cz robots, which cannot sign in.
 *  The 128-bit random token in the path IS the credential — unguessable, per-project,
 *  and revocable by re-minting from the Katalog panel. There is a `route-auth` entry in
 *  .github/security/sast-allowlist.json carrying that reasoning.
 *
 *  ADR-0002 holds even so: the route takes NO tenant from the wire. The token row was
 *  written by the owner-guarded management route (../../projects/[id]/feed-token), and
 *  `(userId, projectId)` is read out of THAT ROW — a caller cannot point a valid token
 *  at somebody else's catalog, because the pairing is stored, not supplied.
 *
 *  This handler references no guard helper on purpose, and the sast rule is meant to
 *  say so out loud rather than be talked out of it by a comment naming one: the
 *  exception belongs in the allowlist, where it is reviewable, not in this file.
 *
 *  Read-only, spends no AI units, and serves only what the owner explicitly exposed.
 *  Honest degradation: an empty catalog answers with a VALID EMPTY feed, never a 404 —
 *  every one of these channels de-lists a shop whose feed errors, so a transiently
 *  empty catalog must not cost a merchant their listings. Only an unknown/revoked token
 *  (or a project that no longer exists) is a 404. */
import { getFeedToken } from "@/lib/catalog/feed-token-store";
import { listOfferings } from "@/lib/catalog/store";
import { getProject } from "@/lib/projects/store";
import { DEFAULT_FEED_OUT_FORMAT, feedOut, isFeedOutFormat } from "@/lib/catalog/feed-out";

/** Half an hour at the edge. The channels re-pull on their own schedule (hours), so a
 *  shared cache absorbs the retries and burst pulls without ever serving a merchant a
 *  browser-cached feed (`max-age=0`) they just re-minted. */
const CACHE_CONTROL = "public, max-age=0, s-maxage=1800";

/** Plain text, never a JSON envelope: the caller is a feed robot, and `no-store` keeps
 *  a revoked token's 404 from being cached against a re-mint. */
function notFound(): Response {
  return new Response("Not found\n", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // The ONLY input. A malformed token is rejected inside getFeedToken without a read.
  const row = await getFeedToken(token);
  if (!row) return notFound();

  // A token whose project is gone (a cascade that half-ran, a manual cleanup) must not
  // serve a feed under a name nobody owns.
  const project = await getProject(row.userId, row.projectId);
  if (!project) return notFound();

  const raw = new URL(req.url).searchParams.get("format");
  const format = isFeedOutFormat(raw) ? raw : DEFAULT_FEED_OUT_FORMAT;

  // null = the project never saved a catalog. That is an EMPTY feed, not an error.
  const offerings = (await listOfferings(row.userId, row.projectId)) ?? [];
  const xml = feedOut(offerings, format, {
    shopName: project.name,
    ...(project.domain ? { shopUrl: shopUrlOf(project.domain) } : {}),
  });

  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": CACHE_CONTROL },
  });
}

/** The project's `domain` is stored as the user typed it ("shop.cz", "https://shop.cz")
 *  — normalize to an absolute URL so the RSS channel `<link>` is a link. */
function shopUrlOf(domain: string): string {
  const d = domain.trim();
  return /^https?:\/\//i.test(d) ? d : `https://${d}`;
}
