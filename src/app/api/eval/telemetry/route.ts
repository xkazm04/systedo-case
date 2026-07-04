/** LLM eval telemetry for operators:
 *   GET → recent per-call telemetry + a per-tool rollup (calls, avg latency,
 *         cost, token usage, contract-drift flag).
 *  The regression dashboard's data source. Node runtime.
 *
 *  This is a PLATFORM-WIDE operational feed (cost/latency/tool-mix across all
 *  tenants — the entries carry no per-tenant field), so it is gated to the
 *  ADMIN_EMAILS allowlist and fails closed: any non-admin (incl. signed-in free
 *  users) gets an empty payload rather than every tenant's AI spend. */
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { listLlmTelemetry, aggregateTelemetry } from "@/lib/llm/telemetry";


export async function GET() {
  const email = ((await auth())?.user as { email?: string } | undefined)?.email ?? null;
  if (!isAdminEmail(email)) return Response.json({ entries: [], tools: [] });

  const entries = await listLlmTelemetry();
  return Response.json({ entries: entries.slice(0, 50), tools: aggregateTelemetry(entries) });
}
