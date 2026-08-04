/** POST /api/feedback — the in-app + public-demo feedback intake. Anonymous-
 *  capable BY DESIGN (the demo shell has no session), so the body is bounded and
 *  the flow is rate-limited per actor (user id when authed, spoof-resistant
 *  client IP otherwise) before anything is written or mailed. Persists via the
 *  dual-backend feedback store and mirrors the submission to SUPPORT_EMAIL as a
 *  best-effort Resend send. All decisions live in lib/feedback/submit (injected
 *  deps, unit-tested); this shell only resolves identity and maps the result to
 *  the wire. Errors carry the stable machine `code` (route-utils catalog); the
 *  client renders its OWN localized copy from the code, never these strings. */
import { randomUUID } from "node:crypto";
import { currentUserId } from "@/lib/session";
import { clientIp, rateLimit, tooLarge, tooManyRequests, payloadTooLarge } from "@/lib/ai/rate-limit";
import { readJson, unprocessable, apiError } from "@/lib/api/route-utils";
import { addFeedback } from "@/lib/feedback/store";
import { sendEmail } from "@/lib/email";
import { submitFeedback, type SubmitFeedbackDeps } from "@/lib/feedback/submit";

const realDeps: SubmitFeedbackDeps = {
  rateLimit,
  addFeedback,
  sendEmail,
  uuid: randomUUID,
  now: () => new Date(),
};

export async function POST(req: Request): Promise<Response> {
  if (tooLarge(req)) return payloadTooLarge("Zpráva je příliš dlouhá.");
  const userId = await currentUserId();
  const body = await readJson(req);

  const result = await submitFeedback(realDeps, { body, userId, ip: clientIp(req) });

  switch (result.status) {
    case 201:
      return Response.json({ ok: true }, { status: 201 });
    case 422:
      return unprocessable("Neplatná zpětná vazba.", result.code);
    case 429:
      return tooManyRequests(result.retryAfter, "Příliš mnoho zpráv. Zkuste to prosím později.");
    case 500:
      return apiError(500, "Uložení se nepodařilo. Zkuste to prosím znovu.");
  }
}
