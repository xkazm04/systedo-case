/** Pure white-label identity resolution for client microsites — no firebase, so
 *  both the server microsite store/route AND the client MicrositeCard can import
 *  it without pulling firebase-admin into the browser bundle (mirrors the
 *  report-config / report-config-types split).
 *
 *  White-label identity (client/brand name + accent colour) is now entered ONCE,
 *  in the report settings (ClientProfile name + brandName + accentColor). The
 *  microsite reads it from there instead of collecting its own duplicate name /
 *  colour inputs. To keep already-published microsites working, identity resolves
 *  in this order, first non-empty value wins PER FIELD:
 *
 *    1. the microsite's own previously-persisted value — an existing site keeps
 *       exactly the name / colour it was published with, so nothing regresses;
 *    2. the tenant's report config — the single white-label source going forward;
 *    3. a hardcoded default (the case-study demo, "Mionelo" / teal).
 *
 *  `brandName` additionally falls back to the resolved `clientName`. `accentColor`
 *  candidates must be a valid #rrggbb hex or they are skipped. */

export interface MicrositeIdentity {
  clientName: string;
  accentColor: string;
  brandName: string;
}

/** The case-study demo identity — the final fallback so a never-configured tenant
 *  publishes exactly the seeded demo it always did. */
export const DEFAULT_MICROSITE_IDENTITY: MicrositeIdentity = {
  clientName: "Mionelo",
  accentColor: "#0f766e",
  brandName: "Mionelo",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Shape a public microsite slug must have: it becomes both a Firestore doc id and
 *  a public /m/{slug} route segment, so only lowercase alphanumerics and dashes,
 *  bounded length. Kept pure here (no firebase) so the server store, the route AND
 *  unit tests can all import it. */
export const MICROSITE_SLUG_RE = /^[a-z0-9-]{3,40}$/;

/** Whether `slug` is a valid public microsite slug (see MICROSITE_SLUG_RE). */
export function isValidMicrositeSlug(slug: string): boolean {
  return MICROSITE_SLUG_RE.test(slug);
}

/** First trimmed, non-empty (and optionally valid) string among candidates. */
function firstString(
  values: Array<string | undefined>,
  valid?: (v: string) => boolean
): string {
  for (const v of values) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t && (!valid || valid(t))) return t;
  }
  return "";
}

/** Resolve a microsite's white-label identity from ordered sources (highest
 *  priority first). See the module header for the fallback contract. */
export function resolveMicrositeIdentity(
  ...sources: Array<Partial<MicrositeIdentity> | null | undefined>
): MicrositeIdentity {
  const list = sources.filter(Boolean) as Array<Partial<MicrositeIdentity>>;
  const clientName =
    firstString(list.map((s) => s.clientName)) || DEFAULT_MICROSITE_IDENTITY.clientName;
  const accentColor =
    firstString(
      list.map((s) => s.accentColor),
      (v) => HEX.test(v)
    ) || DEFAULT_MICROSITE_IDENTITY.accentColor;
  const brandName = firstString(list.map((s) => s.brandName)) || clientName;
  return { clientName, accentColor, brandName };
}
