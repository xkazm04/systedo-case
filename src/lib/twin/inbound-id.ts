/** The inbound-draft PROVENANCE MARK — the id prefix, and the predicate that reads it.
 *
 *  A file of its own, and this is the whole reason: `./inbound.ts` imports `node:crypto`
 *  (it signs, hashes and compares), so a `"use client"` component that only wants to ask
 *  "did this draft arrive from a platform, or did the operator write it?" cannot import
 *  from there without pulling node:crypto into the browser bundle. The mark is the one
 *  thing both sides need, so it lives where both sides can reach it: framework-free, no
 *  node: imports, no I/O.
 *
 *  Provenance rides the ID rather than a new field because no client sanitizer strips it
 *  (`sanitizeDraft` keeps `str(o.id, 60)` verbatim) and no schema change is needed — the
 *  same reasoning behind the socials inbox's `sample` label, one level cheaper. */

/** Every intake-minted draft id starts with this. */
export const INBOUND_ID_PREFIX = "in_";

/** True for a draft that ARRIVED (a real message from a platform), false for one the
 *  operator or the twin composed. Used by the cap/eviction rule — which must never reach
 *  an operator's draft — and by the Schránka's "přijato" pill. */
export function isInboundDraft(d: { id: string }): boolean {
  return typeof d.id === "string" && d.id.startsWith(INBOUND_ID_PREFIX);
}
