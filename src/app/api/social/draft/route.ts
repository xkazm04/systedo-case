/** Social-post drafting: topic + tone + platforms → one tailored caption per
 *  platform. Two modes:
 *   - template (default): deterministic, instant, free.
 *   - ai:true: the LLM social tool (richer copy), IP-throttled + per-user AI quota,
 *     with the deterministic templates as the demo fallback. */
import { auth } from "@/auth";
import { generateSocialPosts } from "@/lib/ai/tools";
import { consume, getUserPlan } from "@/lib/usage";
import { enterByomForOperation } from "@/lib/llm/byom/request";
import { ByomUserError } from "@/lib/llm/errors";
import { getServerLocale } from "@/lib/i18n/locale";
import type { SupportedLocale } from "@/lib/format";
import { buildSnapshot } from "@/lib/snapshot";
import type { PerformanceData } from "@/lib/types";
import { getProject } from "@/lib/projects/store";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { loadBrandContext } from "@/lib/brand/load";
import { resolveTwinVoice } from "@/lib/twin/load";
import { getCompetitors } from "@/lib/competitors/store";
import { competitorGroundingText } from "@/lib/competitors/grounding";
import { DEMO_PROJECTS } from "@/lib/demo/projects";
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

/** Resolve the caller's own dataset for grounding, tenancy-checked (a demo id is
 *  public; a real id must belong to the caller) — so "what's working" reflects
 *  THIS project, not the shared case-study tenant. Undefined → base fallback. */
async function resolveDataset(
  projectId: string | undefined,
  userId: string | null
): Promise<PerformanceData | undefined> {
  if (!projectId) return undefined;
  const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
  if (demo) return getProjectDataset(demo);
  if (userId) {
    const project = await getProject(userId, projectId);
    if (project) return getProjectDataset(project);
  }
  return undefined;
}

/** C1 — when the caller left the brand-voice field blank, fall back to the project's
 *  auto-derived brand context (what it sells + how it talks) so AI posts are on-brand
 *  by default. Tenancy-checked like resolveDataset; undefined when nothing real. */
async function resolveBrandFallback(
  projectId: string | undefined,
  userId: string | null,
  locale: SupportedLocale
): Promise<string | undefined> {
  if (!projectId) return undefined;
  const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
  if (demo) return (await loadBrandContext(demo, locale)) || undefined;
  if (userId) {
    const project = await getProject(userId, projectId);
    if (project) return (await loadBrandContext(project, locale)) || undefined;
  }
  return undefined;
}

/** C3 — the project's competitor grounding for social copy, tenancy-checked (demo
 *  public, real id owner-only). "" when no competitor set. */
async function resolveCompetitorGrounding(
  projectId: string | undefined,
  userId: string | null,
  locale: SupportedLocale
): Promise<string> {
  if (!projectId) return "";
  const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
  if (demo) return competitorGroundingText(await getCompetitors(demo.id), locale);
  if (userId) {
    const project = await getProject(userId, projectId);
    if (project) return competitorGroundingText(await getCompetitors(project.id), locale);
  }
  return "";
}

/** Compact "what's actually working" grounding from the project's data, so AI
 *  social posts lean into the brand's proven channels + trend instead of generic
 *  ideas (the tool previously got only topic/tone/platforms — no performance signal). */
function perfGrounding(data?: PerformanceData): string {
  const snap = buildSnapshot("90d", "previous", data);
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

  let body: { topic?: unknown; tone?: unknown; platforms?: unknown; ai?: unknown; brand?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const parsed = parse(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
  const { topic, tone, platforms } = parsed;
  const brand = str(body.brand) || undefined;
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;

  // Template mode — deterministic, instant, no quota. Carry the project brand so
  // captions never sign off as a placeholder company.
  if (body.ai !== true) {
    return Response.json({ drafts: draftPosts(topic, tone, platforms, brand), source: "template" });
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
    const plan = userId ? await getUserPlan(userId) : "free";
    // BYOM: an entitled caller runs "social" on their assigned provider (matrix
    // override or global active); BYOM-served calls skip the per-user quota.
    const byom = await enterByomForOperation(userId, plan, "social");
    if (userId && !byom) {
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

    const locale = await getServerLocale();
    const dataset = await resolveDataset(projectId, userId);
    // On-brand by default (C1): an empty brand field falls back to the project's
    // auto-derived catalogue voice, so posts never default to a generic sortiment.
    const effectiveBrand = brand ?? (await resolveBrandFallback(projectId, userId, locale));
    // The twin's trained `social` voice, resolved server-side (tenancy-checked) so a
    // client can never dictate another tenant's brand voice. Undefined = untrained,
    // in which case the tool's own "write plainly, on brand" rules govern.
    const voice = await resolveTwinVoice(projectId, userId, "social");
    // C3: fold the competitor set into "what's working" so copy can lean on real
    // differentiators vs. the market instead of generic claims.
    const competitors = await resolveCompetitorGrounding(projectId, userId, locale);
    const response = await generateSocialPosts({
      topic,
      tone,
      platforms,
      grounding: [perfGrounding(dataset), competitors].filter(Boolean).join(" "),
      brand: effectiveBrand,
      voice,
      locale,
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
    if (err instanceof ByomUserError) {
      const status =
        err.code === "auth" || err.code === "permission" ? 401 : err.code === "quota" ? 429 : 400;
      return Response.json({ error: err.message, code: "provider" }, { status });
    }
    console.error("[social] AI draft failed:", err);
    return Response.json(
      { error: "Návrh se nezdařil. Zkuste to prosím za chvíli znovu." },
      { status: 502 }
    );
  } finally {
    releaseSlot();
  }
}
