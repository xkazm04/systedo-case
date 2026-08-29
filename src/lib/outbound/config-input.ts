/** PURE validation of the webhook-settings PUT body. Kept out of the route so the
 *  rules that decide what a tenant may register — how many endpoints, which event
 *  types, which URLs — carry unit tests without a session, a store or a socket.
 *
 *  The URL check is delegated, never re-implemented: `validateWebhookUrl` is the same
 *  guard the SENDER uses (scheme allow-list, no credentials in the URL, no private /
 *  loopback / link-local IP literal, https in production). Validating at PUT time is
 *  a courtesy that gives the owner an immediate error; it is NOT the security
 *  boundary — DNS can be re-pointed afterwards, which is why send.ts validates again
 *  on every single attempt. */
import { FeedFetchError } from "@/lib/catalog/feed-fetch";
import { validateWebhookUrl } from "./send";
import { isOutboundEventType, type OutboundEventType } from "./event-types";
import { MAX_ENDPOINTS } from "./types";

/** One endpoint as it arrives on the wire. `id` present = edit an existing endpoint
 *  (its stored secret is kept); absent = create one (a secret is minted). */
export interface EndpointInput {
  id?: string;
  url: string;
  events: OutboundEventType[] | "all";
  enabled: boolean;
  /** explicit opt-in to replacing an existing endpoint's signing secret */
  rotate?: boolean;
}

export type ParseResult =
  | { ok: true; endpoints: EndpointInput[] }
  | { ok: false; error: string; code: "bad-request" | "unprocessable" };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Parse + validate the whole `endpoints` array. Fails on the FIRST problem with a
 *  message naming it, rather than silently dropping the bad entry — a settings save
 *  that quietly discards one row is worse than one that refuses. */
export function parseEndpointsInput(body: unknown): ParseResult {
  const raw = (body as { endpoints?: unknown })?.endpoints;
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Chybí seznam cílů.", code: "bad-request" };
  }
  if (raw.length > MAX_ENDPOINTS) {
    return {
      ok: false,
      error: `Nejvýše ${MAX_ENDPOINTS} cíle na projekt.`,
      code: "unprocessable",
    };
  }
  const endpoints: EndpointInput[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const url = str((item as { url?: unknown })?.url);
    if (!url) return { ok: false, error: "Zadejte adresu cíle.", code: "bad-request" };
    try {
      validateWebhookUrl(url);
    } catch (e) {
      if (e instanceof FeedFetchError) return { ok: false, error: e.message, code: "unprocessable" };
      throw e;
    }
    // A duplicate URL would double every event to the same receiver and double the
    // retry cost of one dead host; refuse it rather than dedupe silently.
    const key = url.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: "Stejná adresa je uvedená dvakrát.", code: "unprocessable" };
    }
    seen.add(key);

    const evRaw = (item as { events?: unknown })?.events;
    let events: OutboundEventType[] | "all";
    if (evRaw === "all" || evRaw === undefined) {
      events = "all";
    } else if (Array.isArray(evRaw)) {
      const bad = evRaw.find((t) => !isOutboundEventType(t));
      if (bad !== undefined) {
        return { ok: false, error: `Neznámý typ události: ${String(bad)}.`, code: "unprocessable" };
      }
      events = [...new Set(evRaw as OutboundEventType[])];
    } else {
      return { ok: false, error: "Neplatný filtr událostí.", code: "unprocessable" };
    }

    const id = str((item as { id?: unknown })?.id) || undefined;
    const enabledRaw = (item as { enabled?: unknown })?.enabled;
    endpoints.push({
      ...(id ? { id } : {}),
      url,
      events,
      enabled: enabledRaw === undefined ? true : Boolean(enabledRaw),
      ...((item as { rotate?: unknown })?.rotate ? { rotate: true } : {}),
    });
  }
  return { ok: true, endpoints };
}
