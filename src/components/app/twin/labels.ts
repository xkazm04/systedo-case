import type { RejectReason } from "@/lib/twin/types";

/** Human labels for the five rejection reasons, per locale. Shared by the outbox's
 *  reject-reason picker and its history list (the reason tag on a rejected draft),
 *  so the two never drift. */
export const REASON_LABELS: Record<RejectReason, { cs: string; en: string }> = {
  off_brand: { cs: "Mimo hlas značky", en: "Off-brand" },
  inaccurate: { cs: "Nepřesné", en: "Inaccurate" },
  too_long: { cs: "Příliš dlouhé", en: "Too long" },
  wrong_tone: { cs: "Špatný tón", en: "Wrong tone" },
  risky_claim: { cs: "Rizikový slib", en: "Risky claim" },
};
