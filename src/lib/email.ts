import { SITE_NAME } from "@/lib/site";

/** Best-effort outbound webhook (server-only). Posts a Slack-compatible
 *  `{ text }` payload to ALERT_WEBHOOK_URL when set (Slack/Teams/Discord-style
 *  incoming webhooks all accept this), so a team can get alerts where they live.
 *  No-ops (returns false) when unconfigured. */
export async function sendWebhook(text: string): Promise<boolean> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error("[webhook] send failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[webhook] error:", err);
    return false;
  }
}

/** Best-effort transactional email (server-only). Sends via Resend when
 *  RESEND_API_KEY is set; otherwise logs what it would send, so alerting still
 *  works (visibly) in dev / unconfigured environments. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? `${SITE_NAME} <onboarding@resend.dev>`;

  if (!key) {
    console.log(`[email] (no RESEND_API_KEY) would send to ${to}: "${subject}"`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error("[email] send failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] error:", err);
    return false;
  }
}
