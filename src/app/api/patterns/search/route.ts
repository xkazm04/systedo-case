/** Semantic search over the winning-patterns library. POST { query } → patterns
 *  ranked by meaning (Gemini embeddings), or substring-matched when embeddings are
 *  unavailable. IP-throttled (embeds N+1 texts per call) for everyone, plus a
 *  per-user daily quota for signed-in users — the embedding call is paid, so it's
 *  metered like the other AI routes (anonymous stays IP-limited only). */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import { searchPatterns } from "@/lib/patterns/store";
import { consume } from "@/lib/usage";
import { RATE_RULES, clientIp, tooManyRequests } from "@/lib/ai/rate-limit";
import { durableGuard } from "@/lib/ai/durable-limit";


const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function POST(request: Request) {
  const limited = await durableGuard(clientIp(request), [RATE_RULES.aiPerMin()], { spendUnits: 1 });
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho hledání. Zkuste to prosím znovu za ${limited.retryAfter} s.`
    );
  }

  let query = "";
  let projectId: string | null = null;
  try {
    const body = (await request.json()) as { query?: unknown; projectId?: unknown };
    query = str(body.query);
    projectId = str(body.projectId) || null;
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  if (query.length < 2) {
    return Response.json({ error: "Zadejte dotaz (min. 2 znaky)." }, { status: 422 });
  }

  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;

  // Per-user daily quota for signed-in users (the embedding call is paid).
  if (userId) {
    const quota = await consume(userId, "aiEval");
    if (!quota.ok) {
      const { used, limits } = quota.status;
      return Response.json(
        {
          error: `Denní limit vyčerpán (${used.aiEval}/${limits.aiEval}). Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).`,
          code: "quota",
          upgradeUrl: "/cena",
        },
        { status: 429 }
      );
    }
  }

  try {
    const { results, semantic } = await searchPatterns(await resolveTenant(userId, projectId), query);
    return Response.json({ results: results.slice(0, 12), semantic });
  } catch (err) {
    console.error("[patterns] search failed:", err);
    return Response.json({ error: "Hledání se nezdařilo." }, { status: 502 });
  }
}
