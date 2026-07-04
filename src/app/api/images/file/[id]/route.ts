/** Stream a stored creative's bytes from Firebase Storage, scoped to the signed-in
 *  user's tenant so library images stay private (no public bucket URLs). Used as
 *  the <img src> for the asset-library thumbnails. */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import { getCreativeFile } from "@/lib/images/store";


export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const projectId = new URL(request.url).searchParams.get("projectId") || undefined;
  const file = await getCreativeFile(await resolveTenant(uid, projectId), id);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
