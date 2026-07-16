/** Background removal for a generated Creative Studio image — Leonardo nobg
 *  variation by image id, returning a transparent PNG (data URL). Requires
 *  LEONARDO_API_KEY; signed-in only (401 otherwise), the image id must belong to
 *  the caller's tenant (the allowlist /api/images records at generation time —
 *  leonardo ids circulate in every generation response, so an unverified id was a
 *  cross-tenant image read via the provider), IP-throttled + per-user daily image
 *  quota. Node runtime. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { consume, refund } from "@/lib/usage";
import { leonardoConfigured, removeBackground } from "@/lib/leonardo/client";
import { tenantOwnsLeonardoImage } from "@/lib/images/store";
import { releaseSlot } from "@/lib/ai/rate-limit";
import { guardPaidGeneration } from "@/lib/ai/paid-guard";
import { asString } from "@/lib/api/route-utils";

export const maxDuration = 120;

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
    let projectId: string | undefined;
    try {
      const body = (await request.json()) as { imageId?: unknown; projectId?: unknown };
      imageId = asString(body.imageId);
      projectId = asString(body.projectId) || undefined;
    } catch {
      return Response.json({ error: "Neplatný JSON." }, { status: 400 });
    }
    if (!imageId) return Response.json({ error: "Chybí ID obrázku." }, { status: 422 });

    // Signed-in only: anonymous callers used to get real paid Leonardo operations
    // with no per-user metering at all (the quota block was uid-gated), and there
    // is no anonymous tenant to verify ownership against.
    uid = await currentUserId();
    if (!uid) return Response.json({ error: "Pro odebrání pozadí se přihlaste." }, { status: 401 });

    // Ownership: the id must have been produced by THIS tenant's generation (the
    // allowlist /api/images writes). 404 — not 403 — so the route is not an oracle
    // for other tenants' provider ids. A Firestore failure throws → 502 below
    // (fail closed, never a cross-tenant read).
    if (!(await tenantOwnsLeonardoImage(await resolveTenant(uid, projectId), imageId))) {
      return Response.json({ error: "Obrázek nenalezen." }, { status: 404 });
    }

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
