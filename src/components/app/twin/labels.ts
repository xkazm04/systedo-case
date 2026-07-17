import type { RejectReason, ToneScope, TwinChannel } from "@/lib/twin/types";

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

/** The one channel-name vocabulary all three twin screens (outbox, channel management,
 *  voice studio) plus the readiness ribbon must agree on. Was copy-pasted verbatim in
 *  each; a drifted label made the same channel read as two different places and broke the
 *  cross-module NextSteps navigation. Single source now — TypeScript pins every key. */
export const CHANNEL_LABELS: Record<TwinChannel, { cs: string; en: string }> = {
  leads: { cs: "Poptávky", en: "Enquiries" },
  email: { cs: "E-mail", en: "Email" },
  chat: { cs: "Chat", en: "Chat" },
  social: { cs: "Sociální sítě", en: "Social" },
  reviews: { cs: "Recenze", en: "Reviews" },
  sms: { cs: "SMS", en: "SMS" },
  whatsapp: { cs: "WhatsApp", en: "WhatsApp" },
};

/** Tone-scope labels = the channel labels plus the `generic` register. Derived so the
 *  seven channel entries are never re-typed (the voice studio kept its own copy). */
export const SCOPE_LABELS: Record<ToneScope, { cs: string; en: string }> = {
  generic: { cs: "Obecný registr", en: "Generic register" },
  ...CHANNEL_LABELS,
};
