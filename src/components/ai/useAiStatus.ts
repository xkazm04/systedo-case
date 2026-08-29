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
/** Every mounted subscriber, so an invalidation can push a fresh payload into
 *  banners that are ALREADY on screen — they only fetch once, on mount. */
const subscribers = new Set<(status: AiStatusPayload | null) => void>();

function fetchAiStatus(): Promise<AiStatusPayload | null> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/api/ai/status", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          // A transient non-2xx used to leave `inflight` a resolved promise, so
          // NO later mount ever retried — preflight/budget/pacing were silently
          // gone for the page's lifetime. Reset it (mirror the network catch).
          inflight = null;
          return null;
        }
        const status = (await res.json()) as AiStatusPayload;
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

/** Bust the module cache so the next subscriber refetches — call after a
 *  generation spends budget, otherwise the "N left today" preflight stays frozen
 *  at the page-load snapshot and the (N+1)th run 429s with no warning. */
export function invalidateAiStatus(): void {
  cached = null;
  inflight = null;
  // Clearing the cache alone was not enough: the banner and the tool hooks fetch
  // once on mount and stay mounted for the whole visit (the assistant keeps every
  // tool panel mounted across tab switches), so "the next subscriber" was the next
  // page NAVIGATION — the count on screen never moved. Re-fetch once and push.
  if (subscribers.size === 0) return;
  void fetchAiStatus().then((status) => {
    for (const notify of subscribers) notify(status);
  });
}

/** The current AI preflight status, or null while loading / when unavailable. */
export function useAiStatus(): AiStatusPayload | null {
  const [status, setStatus] = useState<AiStatusPayload | null>(null);
  useEffect(() => {
    let alive = true;
    const receive = (s: AiStatusPayload | null) => {
      if (alive && s) setStatus(s);
    };
    subscribers.add(receive);
    void fetchAiStatus().then(receive);
    return () => {
      alive = false;
      subscribers.delete(receive);
    };
  }, []);
  return status;
}
