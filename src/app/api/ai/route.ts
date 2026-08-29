import { currentUserId } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import { getServerLocale } from "@/lib/i18n/locale";
import { enterLlmRequestContext } from "@/lib/llm/request-context";
import { enterByomForOperation } from "@/lib/llm/byom/request";
import { ByomUserError } from "@/lib/llm/errors";
import { clientIp, releaseSlot } from "@/lib/ai/rate-limit";
import { guardPaidGeneration } from "@/lib/ai/paid-guard";
import { dispatchMode } from "./modes";
// The mode table + metering core live in ./dispatch so the two delegate routes
// (/api/social/draft, /api/campaigns/analyze) can share them (Direction 1).
import { MODE_TABLE, cachedRespond } from "./dispatch";

export async function POST(request: Request) {
  // Abuse guards first — this endpoint is a public, unauthenticated POST that
  // shells out to a paid provider, so it must be throttled before any work. The
  // full tooLarge → durableGuard → acquireSlot sequence lives in guardPaidGeneration;
  // releaseSlot() below pairs with the slot it took on a null (proceed) return.
  const guard = await guardPaidGeneration(request);
  if (guard) return guard;

  let mode: unknown;
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Neplatný JSON v požadavku.", code: "invalid" }, { status: 400 });
    }

    mode = (body as { mode?: unknown })?.mode;
    // Output language follows the user's chosen locale, so AI content matches the
    // UI language instead of always being Czech.
    const locale = await getServerLocale();
    // Resolved once: powers the daily quota AND per-project grounding tenancy.
    const userId = await currentUserId();

    // Identity attribution for telemetry (per-user + per-project spend). Best-effort:
    // the projectId is taken from the payload when the caller names one — read back
    // by generateStructured at the recordLlmCall seam.
    const reqProjectId = (body as { projectId?: unknown })?.projectId;
    const projectIdStr = typeof reqProjectId === "string" && reqProjectId ? reqProjectId : undefined;
    enterLlmRequestContext({
      ...(userId ? { userId } : {}),
      ...(projectIdStr ? { projectId: projectIdStr } : {}),
    });

    // BYOM: resolve the per-operation provider for THIS mode (the matrix override
    // for the tool, else the global active vendor) and enter it into the request
    // context — the helper gates on entitlement (byom plan or the BYOM_MATRIX dev
    // flag). cachedRespond reads it back for the cache key + quota-skip; a
    // non-entitled/anonymous caller resolves to none → the app's own providers.
    const plan = userId ? await getUserPlan(userId) : "free";
    await enterByomForOperation(userId, plan, typeof mode === "string" ? mode : "unknown");

    // Every tool call carries request.signal: when the client aborts (timeout,
    // re-run, closed tab), the wrapper kills the Claude CLI child / cancels the
    // provider request instead of burning a concurrency slot on unread output. The
    // per-mode policy (validate / ground / persist / cache-key-rewrite) lives in the
    // descriptor table (./modes); this dispatch is the ONE generic loop over it.
    return await dispatchMode(
      MODE_TABLE,
      typeof mode === "string" ? mode : "",
      { body, locale, userId, projectIdStr, ip: clientIp(request), signal: request.signal },
      cachedRespond
    );
  } catch (err) {
    // A BYOM user fault (bad/expired key, their account out of credit, a model they
    // picked that isn't available) reaches here from the wrapper — surface it with
    // an actionable message + the "provider" code so the client can point the user
    // at their key settings, instead of the generic failure. No app-provider retry.
    if (err instanceof ByomUserError) {
      const status =
        err.code === "auth" || err.code === "permission" ? 401 : err.code === "quota" ? 429 : 400;
      return Response.json({ error: err.message, code: "provider" }, { status });
    }
    console.error(`[ai] generation failed (mode=${String(mode)}):`, err);
    return Response.json(
      { error: "Generování se nezdařilo. Zkuste to prosím za chvíli znovu.", code: "failed" },
      { status: 502 }
    );
  } finally {
    releaseSlot();
  }
}
