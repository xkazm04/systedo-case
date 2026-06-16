/** Background removal for a generated Creative Studio image — Leonardo nobg
 *  variation by image id, returning a transparent PNG (data URL). Requires
 *  LEONARDO_API_KEY; IP-throttled + per-user daily image quota. Node runtime. */
import { auth } from "@/auth";
import { consume } from "@/lib/usage";
import { leonardoConfigured, removeBackground } from "@/lib/leonardo/client";
import {
  RATE_RULES,
  acquireSlot,
  clientIp,
  payloadTooLarge,
  rateLimit,
  releaseSlot,
  tooLarge,
  tooManyRequests,
} from "@/lib/ai/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function POST(request: Request) {
  if (tooLarge(request)) return payloadTooLarge("Požadavek je příliš velký.");
  const limited = rateLimit(clientIp(request), [RATE_RULES.aiPerMin(), RATE_RULES.aiPerDay()]);
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho požadavků. Zkuste to prosím znovu za ${limited.retryAfter} s.`
    );
  }
  if (!acquireSlot()) {
    return tooManyRequests(5, "Server je momentálně vytížený. Zkuste to prosím za chvíli.");
  }

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

    const uid = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
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
    }

    const { buffer, mime } = await removeBackground(imageId);
    return Response.json({ dataUrl: `data:${mime};base64,${buffer.toString("base64")}`, mime });
  } catch (err) {
    console.error("[images] nobg failed:", err);
    return Response.json(
      { error: "Odebrání pozadí se nezdařilo. Zkuste to prosím za chvíli znovu." },
      { status: 502 }
    );
  } finally {
    releaseSlot();
  }
}
