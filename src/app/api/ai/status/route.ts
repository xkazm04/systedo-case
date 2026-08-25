/** Preflight status for the AI tools — GET, free, spends nothing.
 *
 *  The paid POST /api/ai only reveals demo mode AFTER a generation completes
 *  (meta.demo on the result) and only reveals the per-IP budget by returning a
 *  429 — after the user has already filled a careful form. This read-only
 *  sibling answers both questions up front:
 *
 *    - would a generation run on a real provider, or degrade to the canned demo?
 *    - how much of the anonymous per-IP budget (and, when signed in, the plan
 *      quota) is left today?
 *
 *  Nothing here increments a counter or touches a provider beyond the cached
 *  availability probes the wrapper itself uses (import-only — the actual
 *  generation chokepoint is untouched). */
import { currentUserId } from "@/lib/session";
import { isDevEnvironment } from "@/lib/llm";
import { claudeAvailable } from "@/lib/llm/claude";
import { codexAvailable } from "@/lib/llm/codex";
import { geminiAvailable } from "@/lib/llm/gemini";
import { claudeModelTag, codexModelTag, geminiModelTag } from "@/lib/llm/models";
import { aggregateTelemetry, listLlmTelemetry } from "@/lib/llm/telemetry";
import { summarizeAiOps } from "@/lib/llm/telemetry-ops";
import { getUsage } from "@/lib/usage";
import { RATE_RULES, clientIp } from "@/lib/ai/rate-limit";
import { peekDurableRemaining, peekGlobalSpend } from "@/lib/ai/durable-limit";
import { latencyByTool, resolveWouldServe, type AiStatusPayload } from "@/lib/ai/status-core";
import { providerOrder, type ProviderName } from "@/lib/llm/provider-order";
import { SELF_HOSTED } from "@/lib/deploy-mode";


export async function GET(request: Request) {
  const dev = isDevEnvironment();
  const claudeOk = claudeAvailable();
  const geminiOk = geminiAvailable();
  // Codex sits only in the keyless CLI ladder (dev, and self-hosted prod where
  // the CLIs live on the operator's own box) — skip the probe in cloud prod.
  const codexOk = dev || SELF_HOSTED ? codexAvailable() : false;
  const wouldServe = resolveWouldServe(dev, claudeOk, geminiOk, codexOk, SELF_HOSTED);

  // Read-only peek at the same rules — and the same durable counters — the paid
  // route enforces, so the preflight number matches what a POST would hit.
  const rules = [RATE_RULES.aiPerMin(), RATE_RULES.aiPerDay()];
  const [[perMin, perDay], globalSpend] = await Promise.all([
    peekDurableRemaining(clientIp(request), rules),
    // The shared global daily ceiling: gates every caller, but the per-IP peek
    // above can't see it, so a spent global budget would otherwise 429 with no
    // preflight warning. Peek it here so the banner can warn up front.
    peekGlobalSpend(),
  ]);

  // Per-provider health keyed by name, so the diagnostic list below renders in
  // the same environment-preferred order the wrapper actually tries.
  const modelTag: Record<ProviderName, string> = {
    claude: claudeModelTag(),
    codex: codexModelTag(),
    gemini: geminiModelTag(),
  };
  const available: Record<ProviderName, boolean> = { claude: claudeOk, codex: codexOk, gemini: geminiOk };

  const payload: AiStatusPayload = {
    dev,
    demo: wouldServe === "demo",
    wouldServe,
    // Per-provider health, in the wrapper's environment-preferred order — the
    // operator's one-call diagnosis of "why is everything demo?".
    providers: providerOrder(dev, SELF_HOSTED).map((name) => ({
      model: modelTag[name],
      available: available[name],
    })),
    remaining: { perMin, perDay },
    limits: { perMin: rules[0].limit, perDay: rules[1].limit },
  };

  // Surface the shared global daily ceiling only when it is enabled; when spent,
  // preflightNotice raises a "capacity" warning even if the caller's own budget
  // looks fine (the case with the longest, until-midnight lockout).
  if (globalSpend.ceiling > 0) payload.global = globalSpend;

  // Recent demo share from the wrapper's own telemetry: the availability probe
  // is cached, so a provider that silently went down after the probe shows up
  // here (demo-served calls) before anywhere else. Best-effort — the reader
  // returns [] on a store failure and the fields simply stay absent.
  const entries = await listLlmTelemetry(200);
  const recent = summarizeAiOps(aggregateTelemetry(entries));
  if (recent.calls > 0) {
    payload.recent = { calls: recent.calls, demoRate: recent.demoRate };
  }

  // Observed per-tool pace (real calls only), so each tool's loading timer can
  // target how long that tool actually takes instead of one global constant.
  const latency = latencyByTool(entries);
  if (Object.keys(latency).length > 0) payload.latency = latency;

  // Signed-in callers are metered per plan (aiEval) on top of the IP cap; the
  // banner treats the plan quota as the binding budget when it is present.
  const userId = await currentUserId();
  if (userId) {
    try {
      const usage = await getUsage(userId);
      payload.usage = { used: usage.used.aiEval, limit: usage.limits.aiEval };
    } catch {
      /* usage store unavailable — the anonymous budget still renders */
    }
  }

  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
