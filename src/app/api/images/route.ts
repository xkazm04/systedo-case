/** Creative Studio API:
 *   POST   → generate N candidates (Leonardo) scored by Gemini vision, return them
 *            and persist the winner to the tenant's library (signed-in + live).
 *   GET    → list the tenant's saved creatives (library).
 *   DELETE → remove one creative by id.
 *
 *  Image generation is a paid call: IP-throttled + a per-user daily `image` quota.
 *  Node runtime, long maxDuration for Leonardo polling. */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import { consume } from "@/lib/usage";
import { generateImageSet } from "@/lib/images/studio";
import { deleteCreative, listCreatives, saveCreative } from "@/lib/images/store";
import { getStylePrior } from "@/lib/images/attribution";
import {
  MAX_IMAGE_CANDIDATES,
  isImageFormat,
  isImageStyle,
  type GeneratedImage,
  type ImageGenResult,
} from "@/lib/images/types";
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

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

async function userId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

export async function POST(request: Request) {
  if (tooLarge(request)) return payloadTooLarge("Požadavek je příliš velký.");
  const limited = rateLimit(clientIp(request), [RATE_RULES.aiPerMin(), RATE_RULES.aiPerDay()]);
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho generování. Zkuste to prosím znovu za ${limited.retryAfter} s.`
    );
  }
  if (!acquireSlot()) {
    return tooManyRequests(5, "Server je momentálně vytížený. Zkuste to prosím za chvíli.");
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Neplatný JSON v požadavku." }, { status: 400 });
    }

    const prompt = str(body.prompt);
    if (prompt.length < 2 || prompt.length > 500) {
      return Response.json({ error: "Zadejte popis vizuálu (2–500 znaků)." }, { status: 422 });
    }
    if (!isImageStyle(body.style)) return Response.json({ error: "Neplatný styl." }, { status: 422 });
    if (!isImageFormat(body.format)) return Response.json({ error: "Neplatný formát." }, { status: 422 });
    const count = Math.max(1, Math.min(MAX_IMAGE_CANDIDATES, Number(body.count) || 1));
    const avoid = str(body.avoid) || undefined;
    const referenceImageId = str(body.referenceImageId) || undefined;

    const uid = await userId();

    // Style prior from creative→revenue attribution: bias generation toward the
    // look that historically earns (signed-in tenants with attribution data).
    let prior: string | undefined;
    if (uid) {
      try {
        prior = (await getStylePrior(await resolveTenant(uid))).hint || undefined;
      } catch (err) {
        console.error("[images] style prior lookup failed (non-fatal):", err);
      }
    }

    // Per-user daily image quota (signed-in users; anonymous is IP-limited only).
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

    const result = await generateImageSet({
      prompt,
      style: body.style,
      format: body.format,
      count,
      avoid,
      prior,
      imagePromptIds: referenceImageId ? [referenceImageId] : undefined,
    });

    // Persist the winner to the tenant's library (signed-in + real generation).
    let savedId: string | undefined;
    if (uid && result.source === "leonardo") {
      const winner = result.images.find((i) => i.winner) ?? result.images[0];
      if (winner) {
        try {
          savedId = await saveCreative(await resolveTenant(uid), {
            buffer: winner.buffer,
            mime: winner.mime,
            prompt: result.prompt,
            style: result.style,
            format: result.format,
            score: winner.score,
            defects: winner.defects,
          });
        } catch (err) {
          console.error("[images] persist failed (non-fatal):", err);
        }
      }
    }

    // Strip raw buffers before returning to the client.
    const images: GeneratedImage[] = result.images.map((i) => ({
      dataUrl: i.dataUrl,
      mime: i.mime,
      score: i.score,
      defects: i.defects,
      winner: i.winner,
      leonardoImageId: i.leonardoImageId || undefined,
    }));
    const payload: ImageGenResult = {
      prompt: result.prompt,
      style: result.style,
      format: result.format,
      source: result.source,
      images,
      savedId,
    };
    return Response.json(payload);
  } catch (err) {
    console.error("[images] generation failed:", err);
    return Response.json(
      { error: "Generování se nezdařilo. Zkuste to prosím za chvíli znovu." },
      { status: 502 }
    );
  } finally {
    releaseSlot();
  }
}

export async function GET() {
  const uid = await userId();
  if (!uid) return Response.json({ creatives: [] });
  const creatives = await listCreatives(await resolveTenant(uid));
  return Response.json({ creatives });
}

export async function DELETE(request: Request) {
  const uid = await userId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  let id = "";
  try {
    id = str(((await request.json()) as { id?: unknown }).id);
  } catch {
    /* fall through */
  }
  if (!id) return Response.json({ error: "Chybí ID." }, { status: 422 });
  const ok = await deleteCreative(await resolveTenant(uid), id);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
