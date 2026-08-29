/** W3-B — the PUBLIC conversion beacon for a hosted LP experiment:
 *  `POST /m/{slug}/convert` with `{ arm }`.
 *
 *  WHY IT LIVES OUTSIDE `src/app/api/`. It is not an API: it is the other half of a
 *  public web address anonymous visitors reach, and it answers them by construction —
 *  exactly the `/go/{id}` reasoning, verbatim. Putting it under `/api` would make it a
 *  route in that tree with no caller identity, i.e. a permanent, reasoned-about
 *  exception in the security allowlist. Not being there means `scripts/sast.mjs`'s
 *  `route-auth` rule never fires and no waiver has to be written, which is the honest
 *  shape rather than a dodge. It is a SIBLING of the page it belongs to, so the two
 *  are read together and the slug that addresses one addresses the other.
 *
 *  WHAT IT MAY DO, AND NOTHING MORE:
 *   • read ONE microsite config by the slug in its own path;
 *   • accept an `arm` that the PUBLISHED PAYLOAD already contains — an unknown arm is
 *     a 204 like everything else, so a prober learns nothing from the response;
 *   • bump ONE `(experiment, arm, UTC day)` conversion counter, best effort;
 *   • answer 204, always.
 *
 *  It stores NOTHING about the visitor: no IP, no user agent, no referrer, no cookie,
 *  no session. The UA is READ (never stored) for the one bot decision, the same coarse
 *  test the view counter and the `/go` redirect use.
 *
 *  IT ALWAYS ANSWERS 204. A beacon has no UI, so an error code would reach nobody who
 *  could act on it — while a status that VARIED (404 for an unknown slug, 400 for an
 *  unknown arm) would turn this endpoint into an oracle for enumerating which slugs
 *  are live and which arm ids a page serves. One response for every outcome is both
 *  the more useful and the more private answer. */
import { getMicrosite } from "@/lib/microsite";
import { isServedArm } from "@/lib/lp-exp/serve";
import { lpUtcDay } from "@/lib/lp-exp/counts";
import { bumpLpCount } from "@/lib/lp-exp/counts-store";
import { isBotUserAgent } from "@/lib/organic-channels/outcomes";
import { ARM_ID_MAX } from "@/lib/lp-exp/types";

/** The whole body is `{"arm":"<≤40 chars>"}`. Anything past this is not a beacon this
 *  page sent, so it is never read into memory — the guard is on the BYTES, before the
 *  JSON parser, because a parser is the wrong place to first meet an unbounded body. */
const MAX_BODY_BYTES = 64;

/** Always the same answer (see the header). */
function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Bound the body before reading it. `text()` on an unbounded stream is the one thing
  // a public, unauthenticated POST must not do.
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return noContent();

  let armId = "";
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return noContent();
    const body = JSON.parse(raw) as { arm?: unknown };
    armId = typeof body.arm === "string" ? body.arm.trim().slice(0, ARM_ID_MAX) : "";
  } catch {
    return noContent();
  }
  if (!armId) return noContent();

  let config;
  try {
    config = await getMicrosite(slug);
  } catch {
    return noContent();
  }
  // The published payload is the authority on which arms exist. An arm the page never
  // served is not a conversion — it is someone typing into the endpoint — and the
  // counter it would move belongs to a real experiment, so it must not move.
  if (!config || config.kind !== "lp" || !config.lp || !isServedArm(config.lp.arms, armId)) {
    return noContent();
  }

  if (!isBotUserAgent(req.headers.get("user-agent"))) {
    // Fire-and-forget, like the view counter: the beacon's caller has already
    // navigated away and is not waiting for us.
    void bumpLpCount(
      config.lp.experimentId,
      armId,
      lpUtcDay(new Date()),
      "conversions",
      config.lp.projectId
    ).catch(() => {
      /* a lost conversion is a smaller failure than a beacon that blocks a click */
    });
  }

  return noContent();
}
