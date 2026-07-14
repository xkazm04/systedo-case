"use client";

import { useT } from "@/lib/i18n/client";

/** The useCampaigns hook runs outside a component's render, so it can't call
 *  useT to localize its own failure strings. Instead it stores an error as
 *  EITHER one of these known client-side failure KEYS (translated at render by
 *  useCampaignErrorText) or a raw message the SERVER already produced (passed
 *  through verbatim — server-side i18n is a separate concern the hook can't do). */
export type CampaignErrorKey =
  | "loadFailed"
  | "syncFailed"
  | "analyzeFailed"
  | "batchFailed"
  | "serverError";

export type CampaignError = { key: CampaignErrorKey } | { text: string };

const T = {
  cs: {
    loadFailed: "Nepodařilo se načíst kampaně.",
    syncFailed: "Synchronizace se nezdařila.",
    analyzeFailed: "Vyhodnocení se nezdařilo.",
    batchFailed: "Hromadné vyhodnocení se nezdařilo.",
    serverError: "Nepodařilo se spojit se serverem.",
  },
  en: {
    loadFailed: "Could not load campaigns.",
    syncFailed: "Sync failed.",
    analyzeFailed: "Evaluation failed.",
    batchFailed: "Batch evaluation failed.",
    serverError: "Could not reach the server.",
  },
} as const;

/** Build a CampaignError from a fetch `!ok` branch: prefer the server's own
 *  message when present, else fall back to a localized client key. */
export function serverErrorOr(message: unknown, fallback: CampaignErrorKey): CampaignError {
  return typeof message === "string" && message ? { text: message } : { key: fallback };
}

/** Wrap a raw (already-produced) server message as a passthrough error. */
export function rawError(message: string): CampaignError {
  return { text: message };
}

/** Render-side resolver: turns a CampaignError into a localized string, or null
 *  when there's no error (so callers can `{msg && <p>…</p>}`). */
export function useCampaignErrorText(): (e: CampaignError | null | undefined) => string | null {
  const t = useT(T);
  return (e) => (e == null ? null : "key" in e ? t(e.key) : e.text);
}
