/** Keyword research endpoint: keyword ideas + metrics + opportunity grouping for
 *  a seed term, from the user's Google Ads Keyword Planner (live) or the
 *  deterministic sample (keyless/anonymous). Throttled per IP — it can hit the
 *  Ads API — but it isn't a paid LLM call, so no per-user AI quota. Node runtime. */
import { auth } from "@/auth";
import { researchKeywords } from "@/lib/keywords/engine";
import {
  RATE_RULES,
  clientIp,
  payloadTooLarge,
  tooLarge,
  tooManyRequests,
} from "@/lib/ai/rate-limit";
import { durableGuard } from "@/lib/ai/durable-limit";


const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function POST(request: Request) {
  if (tooLarge(request)) {
    return payloadTooLarge("Požadavek je příliš velký.");
  }
  const limited = await durableGuard(clientIp(request), [RATE_RULES.syncPerMin()]);
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho dotazů. Zkuste to prosím znovu za ${limited.retryAfter} s.`
    );
  }

  let body: { seed?: unknown; url?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON v požadavku." }, { status: 400 });
  }

  const seed = str(body.seed);
  if (seed.length < 2 || seed.length > 80) {
    return Response.json({ error: "Zadejte téma / klíčové slovo (2–80 znaků)." }, { status: 422 });
  }
  const url = str(body.url) || undefined;

  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;

  try {
    const result = await researchKeywords(userId, seed, url);
    return Response.json(result);
  } catch (err) {
    console.error("[keywords] research failed:", err);
    return Response.json(
      { error: "Výzkum klíčových slov se nezdařil. Zkuste to prosím znovu." },
      { status: 502 }
    );
  }
}
