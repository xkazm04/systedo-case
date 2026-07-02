/** Daily microsite refresh: revalidate every enabled client microsite so its
 *  cached page picks up the latest snapshot. The page is server-rendered on
 *  demand anyway, but this is the explicit "regenerated daily from the latest
 *  snapshot" hook (and the seam where a live tenant's freshly-synced data would
 *  be precomputed). Guarded by CRON_SECRET; schedule lives in vercel.json. */
import { revalidatePath } from "next/cache";
import { listEnabledSlugs, DEMO_MICROSITE } from "@/lib/microsite";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slugs = new Set([DEMO_MICROSITE.slug, ...(await listEnabledSlugs())]);
  for (const slug of slugs) {
    revalidatePath(`/m/${slug}`);
  }
  return Response.json({ revalidated: slugs.size, slugs: [...slugs] });
}
