/** The outbound event vocabulary, in a module with NO node: imports.
 *
 *  It lives apart from ./types.ts on purpose: types.ts reaches for node:crypto (it
 *  owns the signing), and the settings UI is a `"use client"` component that needs
 *  the list of event types to render its filter checkboxes. Importing the signing
 *  module from the client bundle to get a string array would drag node:crypto across
 *  the server/client line — so the vocabulary, which is genuinely shared, gets its
 *  own dependency-free file and types.ts re-exports it for server callers. */

/** Every event type the bus can emit. A closed union (not `string`) so a new emit
 *  point fails `typecheck` in the UI's copy table instead of rendering a raw slug. */
export const OUTBOUND_EVENT_TYPES = [
  "alert.critical",
  "alert.anomaly",
  "digest.weekly",
  "report.sent",
  "sync.failed",
  "ping",
] as const;

export type OutboundEventType = (typeof OUTBOUND_EVENT_TYPES)[number];

export function isOutboundEventType(v: unknown): v is OutboundEventType {
  return typeof v === "string" && (OUTBOUND_EVENT_TYPES as readonly string[]).includes(v);
}

/** At most three endpoints per project. Three covers the realistic fan-out (a chat
 *  channel, an automation tool, the customer's own service) while keeping ONE emit
 *  bounded to three outbound requests. Lives here rather than in ./types.ts because
 *  the settings card enforces the same number in its "Add destination" button — one
 *  constant, so the button and the server cannot disagree. */
export const MAX_ENDPOINTS = 3;
