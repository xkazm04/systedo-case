import { SITE_NAME } from "@/lib/site";

/** Shared best-effort POST for the two senders below: does the fetch, treats a
 *  non-2xx response or a thrown error as a soft failure (logged with the given
 *  label, returns false) so alerting never throws into a caller. When
 *  `bodyOnError` is set, a failed response's body is included in the log (Resend
 *  returns a useful reason there); the webhook sender omits it, keeping each
 *  sender's exact existing log shape. */
async function postJson(
  label: string,
  url: string,
  init: RequestInit,
  bodyOnError = false
): Promise<boolean> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      if (bodyOnError) {
        console.error(`[${label}] send failed:`, res.status, await res.text().catch(() => ""));
      } else {
        console.error(`[${label}] send failed:`, res.status);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[${label}] error:`, err);
    return false;
  }
}

/** Best-effort outbound webhook (server-only). Posts a Slack-compatible
 *  `{ text }` payload to ALERT_WEBHOOK_URL when set (Slack/Teams/Discord-style
 *  incoming webhooks all accept this), so a team can get alerts where they live.
 *  No-ops (returns false) when unconfigured. */
export async function sendWebhook(text: string): Promise<boolean> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return false;
  return postJson("webhook", url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

/** Best-effort transactional email (server-only). Sends via Resend when
 *  RESEND_API_KEY is set; otherwise logs what it would send, so alerting still
 *  works (visibly) in dev / unconfigured environments. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  // NOTE: onboarding@resend.dev is Resend's SANDBOX sender — it can ONLY deliver to
  // the account owner's own inbox; any real recipient gets a 403. In production,
  // ALERT_FROM_EMAIL is effectively required (readiness.ts warns loudly at boot when
  // RESEND_API_KEY is set without it). This fallback is a dev/self-test default only.
  const from = process.env.ALERT_FROM_EMAIL ?? `${SITE_NAME} <onboarding@resend.dev>`;

  if (!key) {
    console.log(`[email] (no RESEND_API_KEY) would send to ${to}: "${subject}"`);
    return false;
  }

  return postJson(
    "email",
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    },
    true
  );
}

/** Pure decision for a fan-out send (e.g. the report cron): given each
 *  recipient's success flag, how many were delivered and whether the batch should
 *  be marked as sent. Marking sent on >= 1 success stops a re-send to everyone on
 *  the next run; a TOTAL failure returns shouldMarkSent=false so the sent marker
 *  stays unset and the next run retries the whole batch. Side-effect-free. */
export function summarizeDelivery(outcomes: boolean[]): {
  delivered: number;
  failed: number;
  shouldMarkSent: boolean;
} {
  const delivered = outcomes.filter(Boolean).length;
  return { delivered, failed: outcomes.length - delivered, shouldMarkSent: delivered > 0 };
}
