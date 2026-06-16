/** Turn a fresh sync into an alert: notify the user about campaigns that have
 *  *newly* become critical (don't re-alert ones already flagged). The "already
 *  alerted" set lives on the tenant doc, so a recovered-then-relapsed campaign
 *  re-alerts. Server-only. */
import { firestore } from "@/lib/firebase";
import { sendEmail } from "@/lib/email";
import { withMetrics, type Campaign } from "./types";
import { triage } from "./triage";

/** Evaluate the just-synced campaigns and alert on new criticals. Returns how
 *  many new criticals were found. */
export async function evaluateAndAlert(
  tenant: string,
  userId: string,
  campaigns: Campaign[]
): Promise<number> {
  const rows = campaigns.map(withMetrics);
  const criticals = rows.filter((c) => triage(c).severity === "critical");
  const criticalIds = criticals.map((c) => c.id);

  const tenantRef = firestore.collection("tenants").doc(tenant);
  const prevAlerted: string[] = (await tenantRef.get()).data()?.alertedCampaignIds ?? [];
  const fresh = criticals.filter((c) => !prevAlerted.includes(c.id));

  // Remember the current criticals so recovered ones drop and can re-alert later.
  await tenantRef.set({ alertedCampaignIds: criticalIds }, { merge: true });

  if (fresh.length === 0) return 0;

  const email = (await firestore.collection("users").doc(userId).get()).data()?.email as
    | string
    | undefined;
  if (!email) {
    console.log(`[alert] tenant ${tenant}: ${fresh.length} new criticals, no user email`);
    return fresh.length;
  }

  const items = fresh
    .map((c) => {
      const reason = triage(c).primary?.detail ?? "Vyžaduje pozornost.";
      return `<li style="margin:6px 0"><strong>${escapeHtml(c.name)}</strong> — ${escapeHtml(reason)}</li>`;
    })
    .join("");

  const html =
    `<p>Při poslední synchronizaci se objevily nové kritické kampaně:</p>` +
    `<ul>${items}</ul>` +
    `<p>Otevřete přehled v Systedo pro detail, doporučené přesuny rozpočtu a AI vyhodnocení.</p>`;

  await sendEmail(email, `Systedo: ${fresh.length} nových kritických kampaní`, html);
  return fresh.length;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );
}
