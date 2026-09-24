/** The Kanály playbook's MEASURED-LINK door — the pure half.
 *
 *  The outcome ledger counts clicks on `/go/{id}` links, and until now the only
 *  client that could mint one was Distribuce, which content projects alone get. An
 *  eshop on its Firmy.cz row read "fill in your listing", followed the link to
 *  firmy.cz and pasted its plain homepage — the one place a click was countable,
 *  lost. The playbook now mints a link for ANY plan channel through the existing
 *  `POST /api/projects/{id}/go-links` (idempotent per url + channel) and copies its
 *  absolute address. It never posts, publishes or sends: the operator pastes it.
 *
 *  Everything the section decides lives here, so it is testable without React:
 *   • the default destination is the tenant's own site root, from `project.domain`
 *     — nothing is invented when there is no domain;
 *   • a destination on the CHANNEL's own host is refused (a /go link to firmy.cz
 *     measures the directory, not the tenant), after the route's own
 *     http(s)-with-host floor (`safeChannelUrl`);
 *   • the label is the plan channel's own name, so the ledger joins it back through
 *     tier 1 of `joinOutcomesToPlan` even when two channels share a ChannelKey;
 *   • the per-channel link list and click rollup go through that same join — never
 *     an exact-label filter — so the playbook and the /kanaly table agree.
 *  The count stays BESIDE the fit and never reorders the plan. */
import { channelKind, safeChannelUrl, type ChannelKind, type OrganicChannel } from "./types";
import { GO_LINK_CAP, type ChannelOutcome } from "./outcomes";
import { joinOutcomesToPlan } from "./outcome-join";

/** The wire caps the go-links route applies (slice, not reject) — mirrored so the
 *  reuse check compares what the route actually stores. */
const MAX_CHANNEL = 80;
const MAX_CAMPAIGN = 120;

/** One link as `GET /api/projects/{id}/go-links` returns it. */
export interface MeasuredLink {
  id: string;
  href: string;
  url: string;
  channel: string;
  campaign: string;
  createdAt: string;
}

export interface MintBody {
  url: string;
  channel: string;
  campaign: string;
}

export type MintError = "bad-url" | "channel-own-host";

type PlanChannel = Pick<OrganicChannel, "id" | "name">;

/** The tenant's own site root from `project.domain` ("mionelo.cz" or a full URL),
 *  or null when there is none or it is not a web address. */
export function defaultDestination(project: { domain?: string }): string | null {
  const raw = (project.domain ?? "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  if (!safeChannelUrl(withScheme)) return null;
  return `${new URL(withScheme).origin}/`;
}

const bareHost = (host: string): string => host.toLowerCase().replace(/^www\./, "");

/** The channel's own host, when its plan entry carries a canonical URL. */
function channelHost(channel: Pick<OrganicChannel, "url">): string | null {
  const url = safeChannelUrl(channel.url);
  return url ? bareHost(new URL(url).hostname) : null;
}

/** The POST body for this channel and destination, or why it cannot be minted. */
export function mintBody(
  channel: Pick<OrganicChannel, "id" | "name" | "url">,
  dest: string
): MintBody | { error: MintError } {
  const url = safeChannelUrl(dest);
  if (!url) return { error: "bad-url" };
  const own = channelHost(channel);
  const host = bareHost(new URL(url).hostname);
  if (own && (host === own || host.endsWith(`.${own}`))) return { error: "channel-own-host" };
  return {
    url,
    channel: channel.name.trim().slice(0, MAX_CHANNEL),
    campaign: `kanaly-${channel.id}`.slice(0, MAX_CAMPAIGN),
  };
}

export type LinkState =
  | { kind: "demo" }
  | { kind: "invalid"; error: MintError }
  | { kind: "reuse"; href: string }
  | { kind: "at-cap" }
  | { kind: "ready"; body: MintBody };

/** What the mint button can do now. A demo project explains instead of firing a
 *  write that 404s; an existing (url, channel) link is shown and copied without a
 *  POST, AHEAD of the cap check, exactly like the route's idempotency. */
export function linkState({
  demo,
  links,
  channel,
  dest,
  cap = GO_LINK_CAP,
}: {
  demo: boolean;
  links: readonly MeasuredLink[];
  channel: Pick<OrganicChannel, "id" | "name" | "url">;
  dest: string;
  cap?: number;
}): LinkState {
  if (demo) return { kind: "demo" };
  const body = mintBody(channel, dest);
  if ("error" in body) return { kind: "invalid", error: body.error };
  const match = links.find((l) => l.url === body.url && l.channel === body.channel);
  if (match) return { kind: "reuse", href: match.href };
  if (links.length >= cap) return { kind: "at-cap" };
  return { kind: "ready", body };
}

export type PlacementHint =
  | "listing-website-field"
  | "profile-bio"
  | "article-cta"
  | "newsletter-cta"
  | "pitch-signature";

const HINT_BY_KIND: Record<ChannelKind, PlacementHint> = {
  listing: "listing-website-field",
  conversational: "profile-bio",
  content: "article-cta",
  push: "newsletter-cta",
  pr: "pitch-signature",
};

/** Where on this channel the measured link goes, keyed on the channel kind. */
export function placementHint(channel: Pick<OrganicChannel, "category">): PlacementHint {
  return HINT_BY_KIND[channelKind(channel.category)];
}

/** This channel's links, attributed through the ONE outcome join. `plan` is the
 *  whole plan when the caller has it (so an ambiguous label joins nothing); a
 *  caller holding one channel passes nothing and gets a one-channel plan. */
export function linksForChannel<L extends Pick<MeasuredLink, "channel">>(
  links: readonly L[],
  channel: PlanChannel,
  plan: readonly PlanChannel[] = [channel]
): L[] {
  // Each distinct label is joined on its own: it lands on exactly one plan channel
  // or on none, and it is ours when that one channel is this one.
  const ours = new Set(
    [...new Set(links.map((l) => l.channel))].filter((label) => {
      const probe = { channel: label, links: 1, clicks7d: 0, clicks30d: 0 };
      return channel.id in joinOutcomesToPlan(plan, [probe]).byId;
    })
  );
  return links.filter((l) => ours.has(l.channel));
}

/** The live 30-day rollup for this channel (the route's GET `outcomes`), or null. */
export function channelMeasured(
  outcomes: readonly ChannelOutcome[] | undefined,
  channel: PlanChannel,
  plan: readonly PlanChannel[] = [channel]
): ChannelOutcome | null {
  return joinOutcomesToPlan(plan, outcomes).byId[channel.id] ?? null;
}

/** The absolute address that reaches the clipboard: a bare `/go/{id}` pasted into a
 *  directory listing would resolve against the directory, not against this app. */
export function absoluteGoHref(href: string, origin: string): string {
  return new URL(href, origin).toString();
}
