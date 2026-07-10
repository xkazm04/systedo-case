/** Creative Studio API:
 *   POST   → generate N candidates (Leonardo) scored by Gemini vision, return them
 *            and persist the winner to the tenant's library (signed-in + live).
 *   GET    → list the tenant's saved creatives (library).
 *   DELETE → remove one creative by id.
 *
 *  Image generation is a paid call: IP-throttled + a per-user daily `image` quota.
 *  Node runtime, long maxDuration for Leonardo polling. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { consume, refund } from "@/lib/usage";
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
import { releaseSlot } from "@/lib/ai/rate-limit";
import { guardPaidGeneration } from "@/lib/ai/paid-guard";

export const maxDuration = 120;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function POST(request: Request) {
  const guard = await guardPaidGeneration(
    request,
    (s) => `Příliš mnoho generování. Zkuste to prosím znovu za ${s} s.`
  );
  if (guard) return guard;

  // Track the paid units actually charged so a degraded (non-Leonardo) result or a
  // thrown generation can refund them — the user must not spend daily image quota on
  // placeholder SVGs or a 502.
  let uid: string | null = null;
  let charged = 0;
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
    const brand = str(body.brand) || undefined;
    const referenceImageId = str(body.referenceImageId) || undefined;
    const productMode = str(body.referenceMode) === "product";
    const fidelityRaw = Number(body.fidelity);
    const projectId = str(body.projectId) || undefined;

    uid = await currentUserId();

    // Style prior from creative→revenue attribution: bias generation toward the
    // look that historically earns (signed-in tenants with attribution data).
    let prior: string | undefined;
    if (uid) {
      try {
        prior = (await getStylePrior(await resolveTenant(uid, projectId))).hint || undefined;
      } catch (err) {
        console.error("[images] style prior lookup failed (non-fatal):", err);
      }
    }

    // Per-user daily image quota (signed-in users; anonymous is IP-limited only).
    // Charge one unit per candidate — each is its own Leonardo generation plus a
    // Gemini vision score, so an N-candidate set costs N units, not 1.
    if (uid) {
      const quota = await consume(uid, "image", count);
      if (!quota.ok) {
        const { used, limits } = quota.status;
        return Response.json(
          {
            error: `Denní limit generování vizuálů (${used.image}/${limits.image}) nestačí na ${count} ${count === 1 ? "variantu" : "variant"}. Zkuste méně variant, zítra, nebo vyšší plán (ceník na /cena).`,
            code: "quota",
            upgradeUrl: "/cena",
          },
          { status: 429 }
        );
      }
      charged = count;
    }

    const result = await generateImageSet({
      prompt,
      style: body.style,
      format: body.format,
      count,
      avoid,
      brand,
      prior,
      // PRODUCT mode → the reference is the img2img init image (faithful render);
      // STYLE mode → it's an imagePrompt (influence only).
      imagePromptIds: referenceImageId && !productMode ? [referenceImageId] : undefined,
      initImageId: referenceImageId && productMode ? referenceImageId : undefined,
      fidelity: Number.isFinite(fidelityRaw) ? fidelityRaw : undefined,
    });

    // No real Leonardo generation happened (no API key / provider error → deterministic
    // placeholder SVGs). Refund the charged units: the user must not spend daily quota
    // on placeholders that cost the app nothing.
    if (uid && charged && result.source !== "leonardo") {
      await refund(uid, "image", charged);
      charged = 0;
    }

    // Persist the winner to the tenant's library (signed-in + real generation).
    let savedId: string | undefined;
    if (uid && result.source === "leonardo") {
      const winner = result.images.find((i) => i.winner) ?? result.images[0];
      if (winner) {
        try {
          savedId = await saveCreative(await resolveTenant(uid, projectId), {
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
    // The paid work threw after the quota was charged — reclaim it so a provider
    // timeout / error (and any client retry-on-502) can't drain the daily limit.
    if (uid && charged) await refund(uid, "image", charged);
    return Response.json(
      { error: "Generování se nezdařilo. Zkuste to prosím za chvíli znovu." },
      { status: 502 }
    );
  } finally {
    releaseSlot();
  }
}

export async function GET(request: Request) {
  const uid = await currentUserId();
  if (!uid) return Response.json({ creatives: [] });
  const projectId = new URL(request.url).searchParams.get("projectId") || undefined;
  const creatives = await listCreatives(await resolveTenant(uid, projectId));
  return Response.json({ creatives });
}

export async function DELETE(request: Request) {
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  let id = "";
  let projectId: string | undefined;
  try {
    const body = (await request.json()) as { id?: unknown; projectId?: unknown };
    id = str(body.id);
    projectId = str(body.projectId) || undefined;
  } catch {
    /* fall through */
  }
  if (!id) return Response.json({ error: "Chybí ID." }, { status: 422 });
  const ok = await deleteCreative(await resolveTenant(uid, projectId), id);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
