/** Article-specific Open Graph card. Without this file, shares of /clanek fall
 *  back to the root card — the generic portfolio pitch, not the article. Next.js
 *  auto-wires this as og:image + twitter:image for the segment; the card itself
 *  is the shared article builder fed from the validated article singleton. */
import { article } from "@/lib/article";
import { articleOgAlt, articleOgImage, OG_SIZE } from "@/lib/article-og";

export const alt = articleOgAlt(article.meta);
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return articleOgImage(article.meta);
}
