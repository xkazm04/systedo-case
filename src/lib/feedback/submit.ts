/** The feedback POST's decision core, with every store-/provider-touching seam
 *  injected (mirroring the /api/ai mode-table pattern) so the whole flow — rate
 *  limiting, validation, persistence, the best-effort support email — is
 *  unit-testable without Firestore, sqlite or Resend. The route builds realDeps
 *  and stays a thin shell.
 *
 *  Rate limiting: an AUTHED submitter is keyed by user id (an office IP must not
 *  share one budget); an ANONYMOUS demo visitor is keyed by client IP (the same
 *  spoof-resistant clientIp the paid AI routes use) — without this the public
 *  demo dialog is an unauthenticated write + email amplifier. */
import { envInt } from "@/lib/env";
import type { RateRule, RateResult } from "@/lib/ai/rate-limit";
import { SUPPORT_EMAIL } from "@/lib/site";
import { sanitizeFeedbackInput, type FeedbackEntry } from "./types";

const MIN = 60_000;
const DAY = 86_400_000;

/** Per-minute + per-day caps, one budget per actor (user id or IP). Lazily built
 *  so env overrides are read at call time (mirrors WORKSPACE_RATE / RATE_RULES). */
export const FEEDBACK_RATE = {
  perMin: (): RateRule => ({ bucket: "feedback:min", limit: envInt("FEEDBACK_PER_MIN", 3), windowMs: MIN }),
  perDay: (): RateRule => ({ bucket: "feedback:day", limit: envInt("FEEDBACK_PER_DAY", 20), windowMs: DAY }),
};

/** Everything the flow touches in the world, injected. */
export interface SubmitFeedbackDeps {
  /** the shared fixed-window limiter (actorKey is `user:<id>` or the client IP) */
  rateLimit: (actorKey: string, rules: RateRule[]) => RateResult;
  addFeedback: (entry: FeedbackEntry) => Promise<void>;
  /** best-effort transactional email (lib/email sendEmail) */
  sendEmail: (to: string, subject: string, html: string) => Promise<boolean>;
  uuid: () => string;
  now: () => Date;
}

export type SubmitFeedbackResult =
  | { status: 201 }
  | { status: 422; code: "empty-content" | "content-too-long" | "unprocessable" }
  | { status: 429; retryAfter: number }
  | { status: 500 };

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Support-inbox email body. User-supplied text is HTML-escaped — the message
 *  must never be able to inject markup into the support mail. */
export function feedbackEmailHtml(entry: FeedbackEntry): string {
  const lines = [
    `<p><strong>Zdroj:</strong> ${esc(entry.source)}${entry.path ? ` · ${esc(entry.path)}` : ""}</p>`,
    entry.userId ? `<p><strong>Uživatel:</strong> ${esc(entry.userId)}</p>` : "",
    entry.email ? `<p><strong>E-mail:</strong> ${esc(entry.email)}</p>` : "",
    `<p style="white-space:pre-wrap">${esc(entry.message)}</p>`,
    `<p style="color:#888">${esc(entry.at)} · id ${esc(entry.id)}</p>`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Run one submission: rate-limit → validate → persist → best-effort email.
 *  Persistence failure is a real 500 (the submission would be lost); the email is
 *  best-effort by contract (sendEmail already logs and never throws). */
export async function submitFeedback(
  deps: SubmitFeedbackDeps,
  args: { body: unknown; userId: string | null; ip: string }
): Promise<SubmitFeedbackResult> {
  const actorKey = args.userId ? `user:${args.userId}` : args.ip;
  const rate = deps.rateLimit(actorKey, [FEEDBACK_RATE.perMin(), FEEDBACK_RATE.perDay()]);
  if (!rate.ok) return { status: 429, retryAfter: rate.retryAfter };

  const input = sanitizeFeedbackInput(args.body);
  if (!input.ok) return { status: 422, code: input.code };

  const entry: FeedbackEntry = {
    id: deps.uuid(),
    message: input.message,
    source: input.source,
    at: deps.now().toISOString(),
    ...(input.email ? { email: input.email } : {}),
    ...(args.userId ? { userId: args.userId } : {}),
    ...(input.path ? { path: input.path } : {}),
  };

  try {
    await deps.addFeedback(entry);
  } catch (err) {
    console.error("[feedback] persist failed:", err);
    return { status: 500 };
  }

  await deps.sendEmail(
    SUPPORT_EMAIL,
    `Zpětná vazba (${entry.source})`,
    feedbackEmailHtml(entry)
  );

  return { status: 201 };
}
