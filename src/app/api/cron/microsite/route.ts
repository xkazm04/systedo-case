/** Daily microsite refresh: revalidate every enabled client microsite so its
 *  cached page picks up the latest snapshot. The page is server-rendered on
 *  demand anyway, but this is the explicit "regenerated daily from the latest
 *  snapshot" hook (and the seam where a live tenant's freshly-synced data would
 *  be precomputed). Guarded by CRON_SECRET; schedule lives in vercel.json. */
import { revalidatePath } from "next/cache";
import { listEnabledSlugs, DEMO_MICROSITE } from "@/lib/microsite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slugs = new Set([DEMO_MICROSITE.slug, ...(await listEnabledSlugs())]);
  for (const slug of slugs) {
    revalidatePath(`/m/${slug}`);
  }
  return Response.json({ revalidated: slugs.size, slugs: [...slugs] });
}
