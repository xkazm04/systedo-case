/** Minimal HTML escaping for text interpolated into HTML email/webhook bodies.
 *  Escapes the full set — `&`, `<`, `>`, `"`, and `'` — so a single shared
 *  helper serves every server-side alert/report/newsletter template. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );
}
