/** LLM eval telemetry for signed-in users:
 *   GET → recent per-call telemetry + a per-tool rollup (calls, avg latency,
 *         cost, token usage, contract-drift flag).
 *  The regression dashboard's data source. Node runtime. */
import { auth } from "@/auth";
import { listLlmTelemetry, aggregateTelemetry } from "@/lib/llm/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  if (!userId) return Response.json({ entries: [], tools: [] });

  const entries = await listLlmTelemetry();
  return Response.json({ entries: entries.slice(0, 50), tools: aggregateTelemetry(entries) });
}
