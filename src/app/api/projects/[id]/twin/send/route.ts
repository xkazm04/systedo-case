/** Deliver an approved draft through its channel's connector.
 *
 *  This runs server-side on purpose: a real connector holds credentials, and the
 *  decision "is this draft allowed to leave the building" must not be a client
 *  claim. The route re-reads the SAVED state (not the posted one), so a client that
 *  lies about a draft's status cannot smuggle an unapproved message out; the client
 *  persists first, then asks to send.
 *
 *  WP S2 — the claim itself now lives in `lib/twin/deliver.ts`, because the
 *  `twin-dispatch` ledger step has to make the SAME claim and two copies of it would
 *  be two places to mint `sentAt` wrong. What is left here is an adapter: guard,
 *  throttle, read `draftId`, call `deliverDraft`, and map each outcome to the exact
 *  response this route already returned. The Czech copy stays in the route (it is
 *  presentation, and the ledger step has no responses to write), which is also what
 *  keeps the manual-connector path byte-identical to what shipped before.
 *
 *  With only the `manual` connector configured the response still says plainly that
 *  Adamant transmitted nothing; with `RESEND_API_KEY` set, an `email` channel really
 *  sends. See src/lib/twin/connectors.ts. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { deliverDraft } from "@/lib/twin/deliver";
import { apiError, asString, conflict, enforceUserRate, providerError, readJson, WORKSPACE_RATE } from "@/lib/api/route-utils";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  // Throttle before the external channel-connector delivery.
  const limited = enforceUserRate(uid, WORKSPACE_RATE.twinSend(), "Příliš mnoho odeslání. Zkuste to prosím za chvíli.");
  if (limited) return limited;

  const body = await readJson<{ draftId?: unknown }>(req);
  const draftId = asString(body?.draftId);
  if (!draftId) return apiError(400, "Chybí draftId.", "missing-field", { envelope: "ok" });

  const outcome = await deliverDraft(uid, project.id, draftId);

  if (outcome.ok) {
    return Response.json({
      ok: true,
      delivered: outcome.delivered,
      mode: outcome.mode,
      detail: outcome.detail,
      sentAt: outcome.sentAt,
    });
  }

  switch (outcome.kind) {
    case "already-sent":
      // Idempotent: the draft is already delivered/recorded — report success with
      // its recorded time, never re-deliver.
      return Response.json({
        ok: true,
        delivered: false,
        mode: "manual",
        detail: "Tento koncept už byl odeslán.",
        sentAt: outcome.info.sentAt ?? new Date().toISOString(),
      });
    case "not-found":
      return apiError(404, "Koncept nenalezen.", "not-found", { envelope: "ok" });
    case "not-approved":
      return conflict("Odeslat lze jen schválený koncept.", "not-approved", { envelope: "ok" });
    case "connector-unconfigured":
      // Two refusals wearing one status: the connector has no credentials, or THIS
      // draft has no address to send to. Same 409, different sentence — a message
      // that named the connector would be a lie in the second case.
      return conflict(
        outcome.info.missingAddress
          ? "Konceptu chybí doručovací adresa — bez ní nelze odeslat."
          : `Konektor „${outcome.info.connectorLabel}" není nastavený.`,
        "conflict",
        { envelope: "ok" }
      );
    case "cap-exceeded":
      return conflict(
        `Týdenní limit tohoto kanálu je vyčerpaný (${outcome.info.sentThisWeek ?? 0}/${outcome.info.cap ?? 0}).`,
        "conflict",
        { envelope: "ok" }
      );
    case "consent-required":
      return conflict(
        "Kontakt nemá zaznamenaný souhlas pro tento kanál. Zaznamenejte ho v detailu kontaktu.",
        "conflict",
        { envelope: "ok" }
      );
    case "delivery-failed":
      // Was a RAW connector error string handed to the client; now a coded category
      // with a generic Czech message and the raw text server-logged only.
      return providerError({
        category: "provider-error",
        message: "Odeslání přes konektor selhalo.",
        raw: outcome.error,
        context: `twin-send ${outcome.channel}`,
        envelope: "ok",
      });
  }
}
