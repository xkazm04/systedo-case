/** Where a redeemed /sken scan should go — the pure half of the redeem decision.
 *
 *  A visitor who already owns a project for the scanned site should be ASKED whether
 *  the scan enriches that project or starts a new one, instead of silently getting a
 *  duplicate. The redeem route owns the I/O (peek the claim, list the caller's
 *  projects); this module owns the two facts it decides with:
 *   - what "the same site" means. A project's `domain` is the raw string its owner
 *     typed (POST /api/projects stores it as-is), so a scheme, a `www.`, a case
 *     difference or a path must not defeat the match — both sides are normalized to
 *     a bare lowercase host;
 *   - what a candidate looks like on the wire (`RedeemCandidate`), which the client's
 *     chooser renders. Type-only on the client side, so nothing server-only ships.
 *
 *  Pure: no store, no session, no clock. */
import type { ProjectType } from "@/lib/projects/types";

/** One project the scan could be merged into, as the 409 `choose-target` lists it. */
export interface RedeemCandidate {
  id: string;
  name: string;
  domain: string;
  type: ProjectType;
}

/** The literal a client sends to insist on a NEW project despite a match. */
export const NEW_PROJECT_TARGET = "new";

/** A bare, lowercase host without a leading `www.` or a trailing dot — or null when
 *  the input names no host at all. Accepts a full URL or a typed domain
 *  ("Mionelo.cz", "www.mionelo.cz/kontakt", "https://mionelo.cz"). */
export function normalizeHost(raw: string | null | undefined): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.$/, "");
    return host || null;
  } catch {
    return null;
  }
}

/** The caller's projects whose domain is the scanned site's host. A project with no
 *  (or an unparseable) domain never matches, and neither does anything when the scan
 *  carries no usable URL. Order is preserved (the store lists newest first). */
export function matchProjectsByDomain<P extends { domain?: string }>(
  projects: readonly P[],
  scannedUrl: string | null | undefined
): P[] {
  const host = normalizeHost(scannedUrl);
  if (!host) return [];
  return projects.filter((p) => normalizeHost(p.domain) === host);
}
