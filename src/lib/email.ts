/** Best-effort transactional email (server-only). Sends via Resend when
 *  RESEND_API_KEY is set; otherwise logs what it would send, so alerting still
 *  works (visibly) in dev / unconfigured environments. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? "Systedo <onboarding@resend.dev>";

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
