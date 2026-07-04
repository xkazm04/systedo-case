/** Social-post drafting: topic + tone + platforms → one tailored caption per
 *  platform. Two modes:
 *   - template (default): deterministic, instant, free.
 *   - ai:true: the LLM social tool (richer copy), IP-throttled + per-user AI quota,
 *     with the deterministic templates as the demo fallback. */
import { auth } from "@/auth";
import { generateSocialPosts } from "@/lib/ai/tools";
import { consume } from "@/lib/usage";
import { getServerLocale } from "@/lib/i18n/locale";
import { buildSnapshot } from "@/lib/snapshot";
import { fmtMultiple, fmtSignedPct } from "@/lib/format";
import { draftPosts } from "@/lib/social/draft";
import { TONES, isSocialPlatform, type SocialPlatform, type Tone } from "@/lib/social/types";
import {
  RATE_RULES,
  acquireSlot,
  clientIp,
  payloadTooLarge,
  releaseSlot,
  tooLarge,
  tooManyRequests,
} from "@/lib/ai/rate-limit";
import { durableGuard } from "@/lib/ai/durable-limit";


const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Compact "what's actually working" grounding from the dashboard data, so AI
 *  social posts lean into the brand's proven channels + trend instead of generic
 *  ideas (the tool previously got only topic/tone/platforms — no performance signal). */
function perfGrounding(): string {
  const snap = buildSnapshot("90d");
  const top = [...snap.channels]
    .filter((c) => c.roas > 0)
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 2);
  return [
    `Klient ${snap.client.name} (${snap.client.segment}); obrat meziobdobně ${fmtSignedPct(snap.delta.revenue)}.`,
    top.length
      ? `Nejsilnější kanály podle ROAS: ${top.map((c) => `${c.channel} ${fmtMultiple(c.roas)}`).join(", ")}.`
      : "",
    "Drž se osvědčených témat a produktů značky.",
  ]
    .filter(Boolean)
    .join(" ");
}

function parse(body: { topic?: unknown; tone?: unknown; platforms?: unknown }):
  | { ok: true; topic: string; tone: Tone; platforms: SocialPlatform[] }
  | { ok: false; error: string; status: number } {
  const topic = str(body.topic);
  if (topic.length < 2 || topic.length > 200) {
    return { ok: false, error: "Zadejte téma (2–200 znaků).", status: 422 };
  }
  const tone: Tone = (TONES as readonly string[]).includes(str(body.tone)) ? (body.tone as Tone) : "pratelsky";
  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter(isSocialPlatform) as SocialPlatform[];
  if (platforms.length === 0) {
    return { ok: false, error: "Vyberte alespoň jednu platformu.", status: 422 };
  }
  return { ok: true, topic, tone, platforms };
}

export async function POST(request: Request) {
  if (tooLarge(request)) return payloadTooLarge("Požadavek je příliš velký.");

  let body: { topic?: unknown; tone?: unknown; platforms?: unknown; ai?: unknown; brand?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const parsed = parse(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
  const { topic, tone, platforms } = parsed;

  // Template mode — deterministic, instant, no quota.
  if (body.ai !== true) {
    return Response.json({ drafts: draftPosts(topic, tone, platforms), source: "template" });
  }

  // AI mode — a paid model call: throttle + per-user daily quota.
  const limited = await durableGuard(clientIp(request), [RATE_RULES.aiPerMin(), RATE_RULES.aiPerDay()], { spendUnits: 1 });
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
    const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
    if (userId) {
      const quota = await consume(userId, "aiEval");
      if (!quota.ok) {
        return Response.json(
          {
            error: `Denní limit AI generování vyčerpán (${quota.status.used.aiEval}/${quota.status.limits.aiEval}). Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).`,
            upgradeUrl: "/cena",
          },
          { status: 429 }
        );
      }
    }

    const brand = str(body.brand) || undefined;
    const response = await generateSocialPosts({
      topic,
      tone,
      platforms,
      grounding: perfGrounding(),
      brand,
      locale: await getServerLocale(),
      // Client abort propagation: a closed tab / re-run stops the provider work.
      signal: request.signal,
    });
    return Response.json({
      drafts: response.result.posts,
      source: response.meta.demo ? "demo" : "ai",
      model: response.meta.model,
      tookMs: response.meta.tookMs,
    });
  } catch (err) {
    console.error("[social] AI draft failed:", err);
    return Response.json(
      { error: "Návrh se nezdařil. Zkuste to prosím za chvíli znovu." },
      { status: 502 }
    );
  } finally {
    releaseSlot();
  }
}
