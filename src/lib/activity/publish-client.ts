"use client";

/** Fire-and-forget beacon for "this AI-generated asset just left the app".
 *
 *  Deliberately un-awaited at every call site and impossible to throw: an export
 *  button's job is to produce the file, and an audit write that fails must never
 *  turn a working download into an error toast. The route mirrors that stance —
 *  an anonymous caller gets `{recorded:false}`, not a 401.
 *
 *  Feeds the "AI content publish rate" KPI, which had no measurement path at all
 *  before this seam existed: generation was recorded in LLM telemetry, but nothing
 *  recorded whether the output was ever used. */
import type { PublishAssetKind, PublishVia } from "@/lib/activity/publish";

export function reportAssetPublished(
  kind: PublishAssetKind,
  via: PublishVia,
  projectId?: string | null
): void {
  try {
    void fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, via, projectId: projectId ?? undefined }),
      // The user may navigate away the instant the download starts; keepalive lets
      // the request outlive the page the way a beacon should.
      keepalive: true,
    }).catch(() => {
      /* audit write is best-effort — never surface it to the user */
    });
  } catch {
    /* fetch unavailable (SSR/prerender) — nothing to record */
  }
}
