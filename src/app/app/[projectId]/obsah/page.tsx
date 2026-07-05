/** Legacy route — "Obsah & SEO" was merged into "Obsahový engine" (Tvorba).
 *  Permanently redirect so old links / bookmarks land on the unified module. */
import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/app/${projectId}/obsahovy-engine`);
}
