/** Emit a JSON-LD `<script>` with `<` always escaped to `<`, so any
 *  tenant / CMS / generated field inside `data` can never break out of the
 *  `<script>` element with a literal `</script>` (stored XSS on a public, indexed
 *  page). The escape is loss-free for static data, so it is safe to apply
 *  unconditionally — centralized here so no page re-derives the raw-`JSON.stringify`
 *  footgun that was previously fixed on one page but not its siblings. */
export default function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
