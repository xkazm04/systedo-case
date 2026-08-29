/** Mint + list a project's MEASURABLE short links (`/go/{id}`). Per-user,
 *  ownership-checked, server-only.
 *
 *  POST `{ url, channel, campaign? }` returns `{ id, href }`. It is IDEMPOTENT per
 *  `(projectId, url, channel)`: pressing "measured link" twice on the same variant
 *  card must not mint a second address for the same thing, because two ids would
 *  split that channel's clicks across two rows and the panel would under-report
 *  exactly the channel the tenant is working hardest on. GET returns the links plus
 *  their 30-day counts.
 *
 *  ADR-0002: the link's `userId`/`projectId` come from `requireOwnedProject`, never
 *  from the body — the wire supplies only the destination, the channel and the
 *  campaign tag.
 *
 *  The destination is validated to http(s)-with-a-host (`safeChannelUrl`, the same
 *  door the pinned channel plan crosses). That is a deliberate floor rather than an
 *  allowlist: the redirect target is chosen by the AUTHENTICATED OWNER of the
 *  project and is the tenant's own campaign destination, so restricting it to their
 *  own domain would break the module's whole point (a directory listing, a
 *  marketplace profile, a partner's page). What the guard does buy is that a minted
 *  link can never carry a `javascript:` or `data:` scheme into a 302. */
import { randomBytes } from "node:crypto";
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { badRequest, conflict, readJson, trimmedString, unprocessable } from "@/lib/api/route-utils";
import { rateLimit, tooManyRequests } from "@/lib/ai/rate-limit";
import { safeChannelUrl } from "@/lib/organic-channels/types";
import {
  GO_LINK_CAP,
  CLICK_WINDOW_30,
  rollupChannelOutcomes,
  windowStart,
  type GoLink,
} from "@/lib/organic-channels/outcomes";
import { listGoClickDays, listGoLinks, saveGoLink } from "@/lib/organic-channels/outcomes-store";
import { campaignSlug, channelUtmSource, goHref } from "@/lib/distribution/utm";

/** Per-user mint throttle. A mint is cheap, but each one adds a permanent public
 *  address to a shared namespace — worth a bucket of its own. */
const MINT_RATE = { bucket: "go-links:mint", limit: 30, windowMs: 60_000 };

/** Channel labels are display strings ("X / Twitter"), not slugs — bounded, not
 *  coerced, so the rollup's join against the plan's own names still works. */
const MAX_CHANNEL = 80;
const MAX_CAMPAIGN = 120;

/** A public link id. 10 base36 chars ≈ 51 bits, drawn from a CSPRNG: the id IS the
 *  capability to see where the link goes, so it must not be guessable or derivable
 *  from the destination. */
function mintId(): string {
  let out = "";
  while (out.length < 10) {
    out += [...randomBytes(12)].map((b) => (b % 36).toString(36)).join("");
  }
  return out.slice(0, 10);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;

  const links = await listGoLinks(id);
  const now = new Date();
  const rows = await listGoClickDays(
    links.map((l) => l.id),
    windowStart(now, CLICK_WINDOW_30)
  );
  return Response.json({
    links: links.map((l) => ({
      id: l.id,
      href: goHref(l.id),
      url: l.url,
      channel: l.channel,
      campaign: l.campaign,
      createdAt: l.createdAt,
    })),
    outcomes: rollupChannelOutcomes(links, rows, now),
    cap: GO_LINK_CAP,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;

  const limited = rateLimit(`user:${auth.uid}`, [MINT_RATE]);
  if (!limited.ok) {
    return tooManyRequests(limited.retryAfter, "Příliš mnoho odkazů. Zkuste to prosím za chvíli.");
  }

  const body = await readJson<{ url?: unknown; channel?: unknown; campaign?: unknown }>(req);
  const url = safeChannelUrl(trimmedString(body?.url));
  if (!url) return badRequest("Zadejte platnou adresu (http nebo https).", "bad-request");
  const channel = trimmedString(body?.channel).slice(0, MAX_CHANNEL);
  if (!channel) return badRequest("Chybí kanál odkazu.", "missing-field");
  const campaign =
    trimmedString(body?.campaign).slice(0, MAX_CAMPAIGN) || campaignSlug({ title: "", url });
  if (!channelUtmSource(channel)) return unprocessable("Neplatný kanál.", "invalid-type");

  const existing = await listGoLinks(id);
  // Idempotency, ahead of the cap check: re-minting an existing link must succeed
  // even for a project that is already at the ceiling, or the copy button would
  // start failing on links it had already minted.
  const match = existing.find((l) => l.url === url && l.channel === channel);
  if (match) return Response.json({ id: match.id, href: goHref(match.id), reused: true });

  if (existing.length >= GO_LINK_CAP) {
    return conflict(`Projekt už má maximální počet měřených odkazů (${GO_LINK_CAP}).`);
  }

  const link: GoLink = {
    id: mintId(),
    userId: auth.uid,
    projectId: id,
    url,
    channel,
    campaign,
    createdAt: new Date().toISOString(),
  };
  await saveGoLink(link);
  return Response.json({ id: link.id, href: goHref(link.id), reused: false });
}
