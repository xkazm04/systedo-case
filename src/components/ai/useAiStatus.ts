"use client";

/** Client access to the preflight GET /api/ai/status — provider mode + the
 *  caller's remaining AI budget — shared by the panel chrome. The fetch is
 *  module-cached, so however many panels/hooks subscribe, a page load costs
 *  exactly one status request; a failed fetch resolves to null and the UI
 *  simply renders no preflight hint (the post-hoc meta.demo badge and the 429
 *  countdown still cover those paths). */
import { useEffect, useState } from "react";
import type { AiStatusPayload } from "@/lib/ai/status-core";

let cached: AiStatusPayload | null = null;
let inflight: Promise<AiStatusPayload | null> | null = null;

function fetchAiStatus(): Promise<AiStatusPayload | null> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/api/ai/status", { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as AiStatusPayload) : null))
      .then((status) => {
        cached = status;
        return status;
      })
      .catch(() => {
        inflight = null; // a later mount may retry after a transient failure
        return null;
      });
  }
  return inflight;
}

/** The current AI preflight status, or null while loading / when unavailable. */
export function useAiStatus(): AiStatusPayload | null {
  const [status, setStatus] = useState<AiStatusPayload | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchAiStatus().then((s) => {
      if (alive && s) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
