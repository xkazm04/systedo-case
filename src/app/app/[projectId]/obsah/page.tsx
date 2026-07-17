/** Legacy route — "Obsah & SEO" was merged into "Obsahový engine" (Tvorba).
 *  Permanently redirect so old links / bookmarks land on the unified module. */
import { permanentRedirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // 308 (permanent) so crawlers/browsers update bookmarks + transfer link equity to
  // the unified module, matching the docstring's intent — redirect() would emit a 307.
  permanentRedirect(`/app/${projectId}/obsahovy-engine`);
}
