/** LLM eval telemetry for operators:
 *   GET → recent per-call telemetry + a per-tool rollup (calls, avg latency,
 *         cost, token usage, contract-drift flag).
 *  The regression dashboard's data source. Node runtime.
 *
 *  This is a PLATFORM-WIDE operational feed (cost/latency/tool-mix across all
 *  tenants — the entries carry no per-tenant field), so it is gated to the
 *  ADMIN_EMAILS allowlist and fails closed: any non-admin (incl. signed-in free
 *  users) gets an empty payload rather than every tenant's AI spend. */
import { currentSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { listLlmTelemetry, aggregateTelemetry } from "@/lib/llm/telemetry";
import { summarizeAiOps } from "@/lib/llm/telemetry-ops";


export async function GET() {
  const email = (((await currentSession())?.user) as { email?: string } | undefined)?.email ?? null;
  if (!isAdminEmail(email)) return Response.json({ entries: [], tools: [], summary: null });

  const entries = await listLlmTelemetry();
  const tools = aggregateTelemetry(entries);
  // Overall rollup: status counts (success/repaired/corrupt/error/demo), success
  // rate and p50/p95 latency — computed from the raw entries (percentiles can't be
  // derived from the per-tool rollup alone). Per-tool status/percentiles ride along
  // on each `tools[]` row.
  return Response.json({
    entries: entries.slice(0, 50),
    tools,
    summary: summarizeAiOps(tools, entries),
  });
}
