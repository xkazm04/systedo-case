/** The business-type label that grounds AI review replies (`local-review-reply`)
 *  and the local diagnosis. Derived from the project's service catalogue — the
 *  distinct service CATEGORIES, deduped, top two, joined and lower-cased — so the
 *  model gets the field the business actually works in ("zubní ordinace a estetika")
 *  rather than a single hard-coded industry.
 *
 *  ONE derivation, shared (D1): before this, /lokalni joined the top-two categories
 *  while /recenze passed only `services[0]?.category`, so the SAME review, replied to
 *  from two pages, carried a different businessType into the SAME operation. Both
 *  pages now call this. Pure + client-safe (no I/O). */
export function businessTypeFromServices(
  services: { category?: string | null }[]
): string | undefined {
  return (
    [...new Set(services.map((s) => s.category).filter((c): c is string => Boolean(c)))]
      .slice(0, 2)
      .join(" a ")
      .toLowerCase() || undefined
  );
}
