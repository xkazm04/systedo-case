/** Send a `ping` event to this project's webhook endpoints NOW and report what
 *  happened. Per-user, ownership-checked, server-only.
 *
 *  This is the one place a tenant can make the server POST on demand, so it is the
 *  one that most needs a limit: the send itself is SSRF-guarded like every other
 *  delivery, but an unthrottled test button is a request amplifier pointed at a
 *  third party. Hence a tight per-user bucket.
 *
 *  It deliberately goes through the SAME `emitOutbound` path as a real alert — not a
 *  side channel — so a green test is evidence about the real pipeline: the same
 *  guard, the same signature, the same log row, the same retry scheduling. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { rateLimit, tooManyRequests } from "@/lib/ai/rate-limit";
import { apiError } from "@/lib/api/route-utils";
import { emitOutbound } from "@/lib/outbound/emit";
import { hasWebhookCrypto } from "@/lib/outbound/secret-crypto";
import { SITE_NAME } from "@/lib/site";

/** Six on-demand sends a minute is plenty for "does my receiver work?" and far
 *  below anything useful as an amplifier. */
const TEST_RATE = { bucket: "webhooks:test", limit: 6, windowMs: 60_000 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;

  const limited = rateLimit(`user:${auth.uid}`, [TEST_RATE]);
  if (!limited.ok) {
    return tooManyRequests(limited.retryAfter, "Příliš mnoho testů. Zkuste to prosím za chvíli.");
  }

  if (!hasWebhookCrypto()) {
    return apiError(
      501,
      "Server není nakonfigurován pro bezpečné uložení podpisového tajemství (WEBHOOK_SECRET_KEY).",
      "server-misconfigured"
    );
  }

  const result = await emitOutbound(auth.uid, id, {
    type: "ping",
    title: `${SITE_NAME}: testovací událost`,
    body: "Pokud jste tuhle zprávu dostali, podpis i doručení fungují.",
    href: `/app/${id}/nastaveni`,
    data: { test: true },
  });
  return Response.json({ ok: true, ...result });
}
