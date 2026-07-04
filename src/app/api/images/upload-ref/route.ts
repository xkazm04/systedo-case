/** Upload a reference image to Leonardo and return its init-image id, which the
 *  generate route uses as an `imagePrompts` guide (image-to-image). Multipart body
 *  with a single `file`. Requires LEONARDO_API_KEY; IP-throttled. Node runtime. */
import { leonardoConfigured, uploadInitImage, type InitImageExt } from "@/lib/leonardo/client";
import {
  RATE_RULES,
  clientIp,
  tooManyRequests,
} from "@/lib/ai/rate-limit";
import { durableGuard } from "@/lib/ai/durable-limit";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const EXT_BY_TYPE: Record<string, InitImageExt> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const limited = await durableGuard(clientIp(request), [RATE_RULES.aiPerMin()]);
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho nahrání. Zkuste to prosím znovu za ${limited.retryAfter} s.`
    );
  }
  if (!leonardoConfigured()) {
    return Response.json({ error: "Referenční obrázek vyžaduje LEONARDO_API_KEY." }, { status: 400 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return Response.json({ error: "Neplatný požadavek." }, { status: 400 });
  }
  if (!file) return Response.json({ error: "Chybí soubor." }, { status: 422 });
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Obrázek je příliš velký (max 8 MB)." }, { status: 413 });
  }
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return Response.json({ error: "Podporované formáty: PNG, JPG, WEBP." }, { status: 422 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const initImageId = await uploadInitImage(buffer, ext);
    return Response.json({ referenceImageId: initImageId });
  } catch (err) {
    console.error("[images] reference upload failed:", err);
    return Response.json({ error: "Nahrání referenčního obrázku se nezdařilo." }, { status: 502 });
  }
}
