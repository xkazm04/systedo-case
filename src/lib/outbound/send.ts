/** The SSRF-guarded POST that every outbound webhook goes through. Server-only.
 *
 *  Threat model is the feed importer's, one notch tighter: an authed project owner
 *  supplies a URL, and the server will POST to it REPEATEDLY and UNATTENDED (a cron
 *  retries it for hours). It must never become a probe into the deployment's own
 *  network — cloud metadata (169.254.169.254), localhost, RFC-1918, link-local, ULA.
 *
 *  The guard is REUSED, not re-implemented: `validateFeedUrl` (scheme allow-list, no
 *  credentials in the URL, IP-literal check) and `guardedLookup` (every resolved
 *  address checked at CONNECT time, which is what closes the DNS-rebinding TOCTOU a
 *  pre-flight resolve alone leaves open) both come from src/lib/catalog/feed-fetch.ts,
 *  which owns the single BlockList. A second copy of that list is exactly the bug
 *  this module refuses to introduce.
 *
 *  Two deliberate differences from the feed path:
 *   1. **Redirects are NOT followed.** The feed importer re-validates each hop; here
 *      a 3xx is simply a failed delivery. A receiver that moved should be re-pointed
 *      by its owner — silently chasing a redirect turns one validated destination
 *      into an attacker-chosen one on every retry, and the retry budget makes that a
 *      standing capability rather than a one-shot.
 *   2. **The response body is discarded** (drained, capped). We need the status code,
 *      nothing else; not reading a body is one fewer thing a hostile endpoint can
 *      spend our memory on.
 *
 *  Built-ins only (node:https/http) — there is no `fetch` in this directory, by
 *  design: fetch resolves DNS itself and gives no `lookup` hook, so it CANNOT be
 *  guarded. A grep for a bare fetch call under src/lib/outbound is part of
 *  this WP's acceptance, and it must come back empty. */
import "server-only";
import http from "node:http";
import https from "node:https";
import { FeedFetchError, validateFeedUrl, guardedLookup } from "@/lib/catalog/feed-fetch";
import { SITE_NAME } from "@/lib/site";
import {
  signatureHeader,
  type OutboundEvent,
} from "./types";

/** Same 12 s ceiling the feed fetch uses: a webhook receiver that cannot answer in
 *  twelve seconds is down, and the cron invocation is shared with other steps. */
export const OUTBOUND_TIMEOUT_MS = 12_000;

/** Bytes of response body read before the socket is destroyed. We want only the
 *  status; this exists so a receiver streaming a gigabyte cannot hurt us. */
const MAX_RESPONSE_BYTES = 8 * 1024;

/** What one delivery attempt learned. `code` is the HTTP status when the request
 *  actually completed; its absence means the failure happened before a response
 *  (guard refusal, DNS, TLS, timeout). */
export interface OutboundAttempt {
  ok: boolean;
  code?: number;
  error?: string;
}

/** The wire. Injectable so the signing/retry logic is testable without a socket —
 *  the guard itself is NOT injectable and always runs before the transport is
 *  reached, so a test double can never be handed a private address. */
export type OutboundTransport = (
  url: URL,
  body: string,
  headers: Record<string, string>
) => Promise<{ status: number }>;

/** Validate a tenant-supplied webhook URL. Adds ONE rule to `validateFeedUrl`: in
 *  production the scheme must be https, because a plaintext POST would put the
 *  signed event — and everything the alert says about the tenant's account — on the
 *  wire in the clear. http stays allowed in dev so an offline receiver on a public
 *  test host still works. Throws FeedFetchError; the route maps it to a 422. */
export function validateWebhookUrl(raw: string, requireHttps = process.env.NODE_ENV === "production"): URL {
  const url = validateFeedUrl(raw);
  if (requireHttps && url.protocol !== "https:") {
    throw new FeedFetchError("Adresa webhooku musí používat https.");
  }
  return url;
}

/** The real transport: an SSRF-guarded POST over node:http(s). */
export const nodeTransport: OutboundTransport = (url, body, headers) =>
  new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "POST",
        lookup: guardedLookup,
        timeout: OUTBOUND_TIMEOUT_MS,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": String(Buffer.byteLength(body, "utf8")),
          "user-agent": `${SITE_NAME}Webhook/1.0`,
          ...headers,
        },
      },
      (res) => {
        let read = 0;
        res.on("data", (c: Buffer) => {
          read += c.length;
          if (read > MAX_RESPONSE_BYTES) res.destroy();
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
        res.on("error", () => resolve({ status: res.statusCode ?? 0 }));
        res.on("close", () => resolve({ status: res.statusCode ?? 0 }));
      }
    );
    req.on("timeout", () => req.destroy(new FeedFetchError("Webhook neodpověděl včas.")));
    req.on("error", (e) =>
      reject(e instanceof FeedFetchError ? e : new FeedFetchError(errorText(e)))
    );
    req.write(body);
    req.end();
  });

/** A network error's message, kept short and free of anything credential-shaped —
 *  it is persisted in the delivery log and rendered to the owner. */
function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 200);
}

/** The four signed headers a receiver verifies against. Exported so a test — and the
 *  docs — can pin the exact contract. */
export function deliveryHeaders(
  secret: string,
  ts: string,
  raw: string,
  event: { type: string },
  deliveryId: string
): Record<string, string> {
  return {
    "x-adamant-signature": signatureHeader(secret, ts, raw),
    "x-adamant-timestamp": ts,
    "x-adamant-event": event.type,
    "x-adamant-delivery": deliveryId,
  };
}

/** POST one signed event to one endpoint. Never throws: every failure — a guard
 *  refusal, a DNS/TLS error, a timeout, a 3xx, a 5xx — comes back as
 *  `{ ok: false, … }`, because a delivery failure must never propagate into the
 *  alert/digest/report that triggered it.
 *
 *  The URL is re-validated HERE, on every attempt, not only when the endpoint was
 *  registered: a hostname that resolved publicly at PUT time can be re-pointed at
 *  127.0.0.1 an hour later, and the retry step would otherwise happily follow it. */
export async function postGuarded(
  rawUrl: string,
  secret: string,
  raw: string,
  event: Pick<OutboundEvent, "type">,
  deliveryId: string,
  opts: { transport?: OutboundTransport; now?: Date } = {}
): Promise<OutboundAttempt> {
  const transport = opts.transport ?? nodeTransport;
  const ts = (opts.now ?? new Date()).toISOString();
  let url: URL;
  try {
    url = validateWebhookUrl(rawUrl);
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
  try {
    const { status } = await transport(url, raw, deliveryHeaders(secret, ts, raw, event, deliveryId));
    if (status >= 200 && status < 300) return { ok: true, code: status };
    if (status >= 300 && status < 400) {
      // A redirect is a failure on purpose — see the module note.
      return { ok: false, code: status, error: "Přesměrování se nenásleduje." };
    }
    return { ok: false, code: status, error: `Cíl vrátil stav ${status}.` };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
