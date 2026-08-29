/** The PUBLIC measured-link redirect: `GET /go/{id}` → 302 to the link's
 *  destination with this module's UTM triple stamped on (WP W2-A).
 *
 *  WHY IT LIVES OUTSIDE `src/app/api/`. It is not an API: it is a public web
 *  address a tenant pastes into a bio, a directory listing or a forum post, and it
 *  answers to anonymous visitors by construction — exactly like `/m/{slug}`. Putting
 *  it under `/api` would make it the one route in that tree with no caller identity,
 *  i.e. a permanent, reasoned-about exception in the security allowlist. Not being
 *  there means `scripts/sast.mjs`'s `route-auth` rule never fires and no waiver is
 *  needed, which is the honest shape rather than a dodge.
 *
 *  WHAT IT MAY DO, AND NOTHING MORE:
 *   • read ONE link by its id (unknown id → 404; the id is the only capability);
 *   • bump ONE `(link, UTC day)` counter — best effort, never awaited into the
 *     response path, because a counter write that fails must not cost the visitor
 *     the redirect they asked for;
 *   • 302 to `withUtm(destination)`.
 *
 *  It stores NOTHING about the visitor: no IP, no user agent, no referrer, no
 *  cookie, no session. The UA is READ (never stored) for exactly one decision — is
 *  this an automated fetcher? — because a link-unfurler hitting the URL the instant
 *  it is pasted into Slack would otherwise register as the channel's first "click",
 *  and a measurement whose first data point is a robot is worse than no measurement.
 *
 *  302 and not 301: a permanent redirect is cached by the browser, and a cached hop
 *  never reaches this handler again — the counter would freeze at 1 per visitor and
 *  the tenant could never re-point a link. */
import { getGoLink, bumpGoClick } from "@/lib/organic-channels/outcomes-store";
import { isBotUserAgent, utcDay } from "@/lib/organic-channels/outcomes";
import { channelUtmSource, withUtm, UTM_MEDIUM } from "@/lib/distribution/utm";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Bound the lookup key before it reaches a store: an id is 10 chars, so anything
  // longer is a probe, not a link.
  if (!id || id.length > 32) return new Response("Not found", { status: 404 });

  let link;
  try {
    link = await getGoLink(id);
  } catch {
    // A read failure is a server problem, not "this link does not exist" — saying
    // 404 here would tell the tenant their link is dead when it is not.
    return new Response("Service unavailable", { status: 503 });
  }
  if (!link) return new Response("Not found", { status: 404 });

  let target: string;
  try {
    target = withUtm(link.url, {
      source: channelUtmSource(link.channel),
      medium: UTM_MEDIUM,
      campaign: link.campaign,
    });
  } catch {
    // A destination that no longer parses cannot be stamped; send the visitor to the
    // raw stored URL rather than dropping them on an error page.
    target = link.url;
  }

  if (!isBotUserAgent(req.headers.get("user-agent"))) {
    // Fire-and-forget: `void` on purpose. The redirect is the contract; the count is
    // bookkeeping, and awaiting it would put the store's latency in front of every
    // visitor and its failures in front of the tenant's audience.
    void bumpGoClick(link.id, utcDay(new Date())).catch(() => {
      /* a lost count is a smaller failure than a redirect that does not redirect */
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      // Never cached: a cached redirect is an uncounted one, and the destination is
      // the tenant's to change.
      "Cache-Control": "no-store, max-age=0",
      // A short link is not content to be indexed, and the destination has its own
      // canonical identity.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
