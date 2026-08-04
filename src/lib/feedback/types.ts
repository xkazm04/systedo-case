/** Feedback intake model + the pure wire-body sanitizer. A submission is a short
 *  free-text message from the in-app topbar or the public demo shell, with an
 *  OPTIONAL reply email (anonymous demo visitors have no account to answer to).
 *  Framework-free so the route's validation is unit-testable. */

/** One persisted feedback submission. */
export interface FeedbackEntry {
  id: string;
  /** the free-text message (trimmed, bounded) */
  message: string;
  /** optional reply address, supplied by the user (anonymous demo visitors) */
  email?: string;
  /** the signed-in user's id, when the submitter was authed (server-resolved) */
  userId?: string;
  /** which surface the dialog was opened from */
  source: "app" | "demo";
  /** the client pathname the dialog was opened on (bounded, informational) */
  path?: string;
  /** ISO timestamp of the submission */
  at: string;
}

export const FEEDBACK_MESSAGE_MIN = 3;
export const FEEDBACK_MESSAGE_MAX = 2000;
const EMAIL_MAX = 200;
const PATH_MAX = 300;

const str = (v: unknown, max: number): string =>
  (typeof v === "string" ? v.trim() : "").slice(0, max);

/** The sanitized, validated wire body — or a coded rejection. Pure. */
export type FeedbackInput =
  | { ok: true; message: string; email?: string; source: "app" | "demo"; path?: string }
  | { ok: false; code: "empty-content" | "content-too-long" | "unprocessable" };

/** Coerce + validate a feedback POST body. The message is required (3..2000
 *  chars); the email is optional but, when present, must look like an address
 *  (loose shape check — deliverability is not verifiable here); path/source are
 *  informational and coerced to safe bounds. */
export function sanitizeFeedbackInput(raw: unknown): FeedbackInput {
  if (!raw || typeof raw !== "object") return { ok: false, code: "unprocessable" };
  const o = raw as Record<string, unknown>;
  const message = typeof o.message === "string" ? o.message.trim() : "";
  if (message.length < FEEDBACK_MESSAGE_MIN) return { ok: false, code: "empty-content" };
  if (message.length > FEEDBACK_MESSAGE_MAX) return { ok: false, code: "content-too-long" };
  const email = str(o.email, EMAIL_MAX);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, code: "unprocessable" };
  const source = o.source === "demo" ? "demo" : "app";
  const path = str(o.path, PATH_MAX);
  return {
    ok: true,
    message,
    source,
    ...(email ? { email } : {}),
    ...(path ? { path } : {}),
  };
}
