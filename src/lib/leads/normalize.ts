/** Dedup-key normalisation for the lead entity layer. PURE — no I/O, no clock, no
 *  dependency beyond the repo's existing diacritic folder. Every rule here exists
 *  because getting it wrong either MERGES TWO PEOPLE or leaves the same person in
 *  the CRM three times, so each one is deliberate and narrow.
 *
 *  The contract (docs/leads/design.md §B6):
 *   - store the normalised key NEXT TO the raw display value, and match only on the
 *     normalised one;
 *   - auto-merge on an exact normalised email OR an exact E.164 phone — nothing
 *     else. Name similarity is a SUGGESTION, never an automatic merge;
 *   - every auto-merge is reversible (`Contact.mergedFrom` on the survivor). */
import { normalizeForSearch } from "@/lib/nav";

/* ── email ───────────────────────────────────────────────────────────────────── */

/** Providers that genuinely implement plus-addressing AND dot-insensitivity. This
 *  list is deliberately TINY: stripping `+tag` or dots for an arbitrary domain is a
 *  correctness bug, because `a.b@example.com` and `ab@example.com` are two
 *  different mailboxes under RFC 5321 unless the operator says otherwise. */
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Canonical domain aliases (a rename, not a normalisation guess). */
const DOMAIN_ALIASES: Record<string, string> = { "googlemail.com": "gmail.com" };

/** Normalise an email into a dedup key, or `undefined` when it is not an email.
 *
 *  Rules: trim + lowercase → canonicalise the domain (googlemail.com → gmail.com)
 *  → for gmail only, drop everything from the first `+` in the local part and strip
 *  dots. Everything else keeps its local part byte-for-byte (lowercased). */
export function normalizeEmail(raw: string | undefined | null): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  const at = s.lastIndexOf("@");
  if (at <= 0 || at === s.length - 1) return undefined;

  let local = s.slice(0, at);
  let domain = s.slice(at + 1);
  // A trailing dot or whitespace inside the address is malformed, not a variant.
  if (/\s/.test(s)) return undefined;
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return undefined;

  domain = DOMAIN_ALIASES[domain] ?? domain;

  if (GMAIL_DOMAINS.has(domain)) {
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
    local = local.replace(/\./g, "");
  }
  if (!local) return undefined;
  return `${local}@${domain}`;
}

/* ── phone ───────────────────────────────────────────────────────────────────── */

/** Default calling region. Adamant is Czech-first; Slovakia is the natural second
 *  market and shares the 9-digit national format, which is why both are handled
 *  here rather than by pulling in libphonenumber-js for a two-country problem. */
export type PhoneRegion = "CZ" | "SK";

const REGION_CC: Record<PhoneRegion, string> = { CZ: "420", SK: "421" };
/** Country codes whose national number is exactly 9 digits (CZ + SK). */
const NINE_DIGIT_CC = new Set(["420", "421"]);

/** E.164 allows at most 15 digits including the country code; below 8 nothing real
 *  survives (and a 6-digit "phone" is almost always a parsed order number). */
const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

/** Normalise a phone number to E.164 (`+420777123456`), or `undefined` when the
 *  input cannot be a phone number. CZ/SK-first: a bare national number is assumed
 *  to belong to `region`.
 *
 *  Accepted and folded to the same key:
 *    `+420 777 123 456` · `777 123 456` · `00420777123456` · `420777123456`
 *    `(+420) 777-123-456` · `+420.777.123.456`
 *  A single leading trunk `0` (Slovak/European national notation) is stripped
 *  before the region code is applied. */
export function normalizePhone(
  raw: string | undefined | null,
  region: PhoneRegion = "CZ"
): string | undefined {
  if (typeof raw !== "string") return undefined;
  let s = raw.trim();
  if (!s) return undefined;

  // An extension marker means the digits after it are not part of the number.
  s = s.replace(/(?:\bext\.?|\bx|,|;)\s*\d+\s*$/i, "");

  const hadPlus = s.startsWith("+");
  let digits = s.replace(/\D/g, "");
  if (!digits) return undefined;

  if (!hadPlus && digits.startsWith("00")) {
    // International access code — the rest is already country-code-first.
    digits = digits.slice(2);
  } else if (!hadPlus && digits.startsWith("0")) {
    // National trunk prefix → a national number in the default region.
    digits = REGION_CC[region] + digits.replace(/^0+/, "");
  } else if (!hadPlus && !startsWithKnownCc(digits)) {
    // A bare national number (CZ/SK are 9 digits).
    if (digits.length === 9) digits = REGION_CC[region] + digits;
  }

  if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) return undefined;
  // A CZ/SK number must be exactly cc + 9; anything else under those codes is a typo
  // we must NOT fold onto a real subscriber.
  const cc = digits.slice(0, 3);
  if (NINE_DIGIT_CC.has(cc) && digits.length !== 12) return undefined;
  return `+${digits}`;
}

function startsWithKnownCc(digits: string): boolean {
  return NINE_DIGIT_CC.has(digits.slice(0, 3)) && digits.length === 12;
}

/* ── name / company ──────────────────────────────────────────────────────────── */

/** Diacritic-folded, whitespace-collapsed name key. Reuses `normalizeForSearch`
 *  (already in the repo, NFD-strip + lowercase, Czech-safe). SUGGESTION ONLY — two
 *  contacts sharing a `nameKey` are a duplicate *candidate* a human confirms. */
export function normalizeName(raw: string | undefined | null): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = normalizeForSearch(raw).replace(/\s+/g, " ").trim();
  return t || undefined;
}

/** The registrable-ish domain of an email — the company key of last resort when no
 *  IČO is known. Free-mail domains deliberately return `undefined`: half a town
 *  shares gmail.com and merging on it would be catastrophic. */
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "seznam.cz",
  "email.cz",
  "centrum.cz",
  "post.cz",
  "volny.cz",
  "atlas.cz",
  "azet.sk",
  "zoznam.sk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

export function companyDomainFromEmail(email: string | undefined | null): string | undefined {
  const key = normalizeEmail(email);
  if (!key) return undefined;
  const domain = key.slice(key.lastIndexOf("@") + 1);
  return FREE_MAIL.has(domain) ? undefined : domain;
}

/** Czech IČO: exactly 8 digits (shorter forms are zero-padded in the register). */
export function normalizeIco(raw: string | undefined | null): string | undefined {
  if (typeof raw !== "string") return undefined;
  const digits = raw.replace(/\D/g, "");
  if (!digits || digits.length > 8) return undefined;
  return digits.padStart(8, "0");
}

/* ── the derived key set ─────────────────────────────────────────────────────── */

export interface IdentityInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ContactKeys {
  emailKey?: string;
  phoneKey?: string;
  nameKey?: string;
}

/** Derive all three dedup keys at once — the single call every write path uses so
 *  a key can never be computed one way on ingest and another way on lookup. */
export function contactKeys(input: IdentityInput, region: PhoneRegion = "CZ"): ContactKeys {
  const keys: ContactKeys = {};
  const emailKey = normalizeEmail(input.email);
  if (emailKey) keys.emailKey = emailKey;
  const phoneKey = normalizePhone(input.phone, region);
  if (phoneKey) keys.phoneKey = phoneKey;
  const nameKey = normalizeName(input.name);
  if (nameKey) keys.nameKey = nameKey;
  return keys;
}

/** Do these two identities auto-merge? Exact normalised email OR exact E.164
 *  phone — and nothing else. A shared `nameKey` alone is explicitly NOT a match. */
export function isAutoMergeMatch(a: ContactKeys, b: ContactKeys): boolean {
  if (a.emailKey && b.emailKey && a.emailKey === b.emailKey) return true;
  if (a.phoneKey && b.phoneKey && a.phoneKey === b.phoneKey) return true;
  return false;
}

/** A weaker signal for the "possible duplicate" review queue: same folded name and
 *  no contradicting hard key. Never call this a match — surface it to a human. */
export function isDuplicateCandidate(a: ContactKeys, b: ContactKeys): boolean {
  if (isAutoMergeMatch(a, b)) return false; // already a hard match
  if (!a.nameKey || !b.nameKey || a.nameKey !== b.nameKey) return false;
  if (a.emailKey && b.emailKey && a.emailKey !== b.emailKey) return false;
  if (a.phoneKey && b.phoneKey && a.phoneKey !== b.phoneKey) return false;
  return true;
}
