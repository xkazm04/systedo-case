/** SSRF-guarded fetch of a user-supplied product-feed URL. Server-only.
 *
 *  Threat model: an authed project owner supplies a URL; it must not be usable to
 *  reach the server's internal network (cloud metadata 169.254.169.254, localhost,
 *  RFC-1918, link-local, ULA). Guards:
 *   - scheme allow-list (http/https only); reject credentials in the URL;
 *   - every resolved IP is checked against a private/reserved BlockList — via a
 *     custom `lookup` on the request, so the CONNECT-time address is validated
 *     (closes the DNS-rebinding TOCTOU a pre-fetch resolve alone leaves open) — plus
 *     a direct check for IP-literal hosts (where the lookup is bypassed);
 *   - redirects are followed manually (max 3), re-validating each hop;
 *   - a 12 s timeout and a 10 MB cap on the DECOMPRESSED body (zip-bomb safe).
 *  Built-ins only (node:https/http/zlib/net/dns) — no new dependency. */
import "server-only";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import dns from "node:dns";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";

const MAX_BYTES = 10_000_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

export class FeedFetchError extends Error {}

const BLOCK = new net.BlockList();
// IPv4 — this-host, private, CGNAT, loopback, link-local (incl. 169.254.169.254
// cloud metadata), IETF-reserved, benchmark, multicast, future-use.
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as [string, number][]) {
  BLOCK.addSubnet(addr, prefix, "ipv4");
}
BLOCK.addAddress("255.255.255.255", "ipv4");
// IPv6 — loopback, unspecified, ULA, link-local, multicast, NAT64.
BLOCK.addAddress("::1", "ipv6");
BLOCK.addAddress("::", "ipv6");
for (const [addr, prefix] of [
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
  // IPv4-mapped range — belt-and-suspenders against a mapped address reaching the
  // block-list un-normalized. isPublicIp() unwraps these to the embedded IPv4 first.
  ["::ffff:0:0", 96],
] as [string, number][]) {
  BLOCK.addSubnet(addr, prefix, "ipv6");
}

/** Extract the embedded IPv4 of a v4-mapped IPv6 address, in BOTH the dotted
 *  (`::ffff:1.2.3.4`) and the fully-hex (`::ffff:a9fe:a9fe`) notations that
 *  net.isIP accepts and the kernel routes. Returns null for a non-mapped address. */
function mappedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

/** True only for a routable public IP. A v4-mapped v6 address is validated as its
 *  embedded IPv4 — in either dotted OR hex form, so `::ffff:a9fe:a9fe` (169.254.169.254)
 *  can't slip past the IPv6 block-list; a non-IP string fails closed. */
export function isPublicIp(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 0) return false;
  const mapped = mappedIpv4(ip);
  if (mapped) return isPublicIp(mapped);
  return !BLOCK.check(ip, fam === 4 ? "ipv4" : "ipv6");
}

/** Validate a feed URL's scheme/host; throws FeedFetchError on anything unsafe.
 *  IP-literal hosts are checked here since the request's lookup is bypassed for them. */
export function validateFeedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FeedFetchError("Neplatná adresa feedu.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FeedFetchError("Povoleny jsou jen adresy http a https.");
  }
  if (url.username || url.password) {
    throw new FeedFetchError("Adresa nesmí obsahovat přihlašovací údaje.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (net.isIP(host) && !isPublicIp(host)) {
    throw new FeedFetchError("Adresa míří na neveřejnou IP.");
  }
  return url;
}

/** dns.lookup permissively retyped — node:net sockets call lookup with `all: true`,
 *  so the address is a LookupAddress[]; the overloaded types don't model our single
 *  guarded path, hence the cast. */
const rawLookup = dns.lookup as unknown as (
  hostname: string,
  options: dns.LookupOneOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family: number) => void
) => void;

/** dns.lookup wrapper that rejects if ANY resolved address is private/reserved, so
 *  the socket only ever connects to validated public IPs (closes the DNS-rebinding
 *  TOCTOU). Handles both the array (`all: true`, what net uses) and single forms. */
const guardedLookup = ((
  hostname: string,
  options: dns.LookupOneOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family: number) => void
): void => {
  rawLookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    const list: dns.LookupAddress[] = Array.isArray(address) ? address : [{ address, family }];
    const bad = list.find((a) => !isPublicIp(a.address));
    if (bad) {
      const blocked = new FeedFetchError(
        `Adresa se přeložila na neveřejnou IP (${bad.address}).`
      ) as NodeJS.ErrnoException;
      return callback(blocked, address, family);
    }
    callback(null, address, family);
  });
}) as unknown as typeof dns.lookup;

function rawGet(url: URL, extraHeaders?: Record<string, string>): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": "AdamantFeedBot/1.0 (+catalog import)",
          accept: "application/json, application/xml, text/xml, application/rss+xml, text/csv, */*",
          "accept-encoding": "gzip, deflate, br",
          ...extraHeaders,
        },
      },
      resolve
    );
    req.on("timeout", () => req.destroy(new FeedFetchError("Vypršel časový limit stahování feedu.")));
    req.on("error", (e) =>
      reject(e instanceof FeedFetchError ? e : new FeedFetchError("Feed se nepodařilo stáhnout."))
    );
    req.end();
  });
}

function readCapped(res: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(res.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      res.destroy();
      return reject(new FeedFetchError("Feed je příliš velký."));
    }
    const enc = String(res.headers["content-encoding"] || "").toLowerCase();
    const stream: Readable =
      enc === "gzip"
        ? res.pipe(zlib.createGunzip())
        : enc === "deflate"
          ? res.pipe(zlib.createInflate())
          : enc === "br"
            ? res.pipe(zlib.createBrotliDecompress())
            : res;
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const fail = (msg: string) => {
      if (done) return;
      done = true;
      res.destroy();
      stream.destroy();
      reject(new FeedFetchError(msg));
    };
    stream.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BYTES) return fail("Feed je příliš velký."); // decompressed cap
      chunks.push(c);
    });
    stream.on("end", () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    stream.on("error", () => fail("Feed se nepodařilo přečíst."));
  });
}

/** Fetch a URL's text with SSRF protection. Throws FeedFetchError on any guard or
 *  network failure — the route surfaces the message to the user. `opts.headers` adds
 *  request headers (e.g. an ERP endpoint's auth), merged over the defaults. */
export async function fetchFeed(rawUrl: string, opts?: { headers?: Record<string, string> }): Promise<string> {
  let url = validateFeedUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await rawGet(url, opts?.headers);
    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location) {
      res.resume(); // drain to free the socket
      url = validateFeedUrl(new URL(location, url).toString());
      continue;
    }
    if (status !== 200) {
      res.resume();
      throw new FeedFetchError(`Server feedu vrátil stav ${status}.`);
    }
    return readCapped(res);
  }
  throw new FeedFetchError("Příliš mnoho přesměrování.");
}
