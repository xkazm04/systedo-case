/** Open Graph card for the auto-generated performance report — the same shared
 *  article card as /clanek, fed from the generated report's own meta (title,
 *  category, reading time), instead of the unrelated root portfolio card. */
import { articleOgAlt, articleOgImage, OG_SIZE } from "@/lib/article-og";
import { reportArticle } from "./report-article";

export const alt = articleOgAlt(reportArticle.meta);
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return articleOgImage(reportArticle.meta);
}
