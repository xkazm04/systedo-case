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
import { auth } from "@/auth";
import { isDevEnvironment } from "@/lib/llm";
import { claudeAvailable } from "@/lib/llm/claude";
import { geminiAvailable } from "@/lib/llm/gemini";
import { claudeModelTag, geminiModelTag } from "@/lib/llm/models";
import { aggregateTelemetry, listLlmTelemetry } from "@/lib/llm/telemetry";
import { summarizeAiOps } from "@/lib/llm/telemetry-ops";
import { getUsage } from "@/lib/usage";
import { RATE_RULES, clientIp } from "@/lib/ai/rate-limit";
import { peekDurableRemaining } from "@/lib/ai/durable-limit";
import { latencyByTool, resolveWouldServe, type AiStatusPayload } from "@/lib/ai/status-core";


export async function GET(request: Request) {
  const dev = isDevEnvironment();
  const claudeOk = claudeAvailable();
  const geminiOk = geminiAvailable();
  const wouldServe = resolveWouldServe(dev, claudeOk, geminiOk);

  // Read-only peek at the same rules — and the same durable counters — the paid
  // route enforces, so the preflight number matches what a POST would hit.
  const rules = [RATE_RULES.aiPerMin(), RATE_RULES.aiPerDay()];
  const [perMin, perDay] = await peekDurableRemaining(clientIp(request), rules);

  const payload: AiStatusPayload = {
    dev,
    demo: wouldServe === "demo",
    wouldServe,
    // Per-provider health, in the wrapper's environment-preferred order — the
    // operator's one-call diagnosis of "why is everything demo?".
    providers: dev
      ? [
          { model: claudeModelTag(), available: claudeOk },
          { model: geminiModelTag(), available: geminiOk },
        ]
      : [
          { model: geminiModelTag(), available: geminiOk },
          { model: claudeModelTag(), available: claudeOk },
        ],
    remaining: { perMin, perDay },
    limits: { perMin: rules[0].limit, perDay: rules[1].limit },
  };

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
  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
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
