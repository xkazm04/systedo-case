/** Background removal for a generated Creative Studio image — Leonardo nobg
 *  variation by image id, returning a transparent PNG (data URL). Requires
 *  LEONARDO_API_KEY; IP-throttled + per-user daily image quota. Node runtime. */
import { currentUserId } from "@/lib/session";
import { consume, refund } from "@/lib/usage";
import { leonardoConfigured, removeBackground } from "@/lib/leonardo/client";
import { releaseSlot } from "@/lib/ai/rate-limit";
import { guardPaidGeneration } from "@/lib/ai/paid-guard";

export const maxDuration = 120;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function POST(request: Request) {
  const guard = await guardPaidGeneration(request);
  if (guard) return guard;

  let uid: string | null = null;
  let charged = false;
  try {
    if (!leonardoConfigured()) {
      return Response.json({ error: "Odebrání pozadí vyžaduje LEONARDO_API_KEY." }, { status: 400 });
    }
    let imageId = "";
    try {
      imageId = str(((await request.json()) as { imageId?: unknown }).imageId);
    } catch {
      return Response.json({ error: "Neplatný JSON." }, { status: 400 });
    }
    if (!imageId) return Response.json({ error: "Chybí ID obrázku." }, { status: 422 });

    uid = await currentUserId();
    if (uid) {
      const quota = await consume(uid, "image");
      if (!quota.ok) {
        return Response.json(
          {
            error: `Denní limit generování vizuálů vyčerpán (${quota.status.used.image}/${quota.status.limits.image}). Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).`,
            upgradeUrl: "/cena",
          },
          { status: 429 }
        );
      }
      charged = true;
    }

    const { buffer, mime } = await removeBackground(imageId);
    return Response.json({ dataUrl: `data:${mime};base64,${buffer.toString("base64")}`, mime });
  } catch (err) {
    console.error("[images] nobg failed:", err);
    // removeBackground threw after the quota was charged — reclaim it so a provider
    // failure (and any retry-on-502) can't drain the daily image limit.
    if (uid && charged) await refund(uid, "image");
    return Response.json(
      { error: "Odebrání pozadí se nezdařilo. Zkuste to prosím za chvíli znovu." },
      { status: 502 }
    );
  } finally {
    releaseSlot();
  }
}
