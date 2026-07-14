"use client";

import { useRef, useState } from "react";

export interface BatchProgress {
  done: number;
  total: number;
}

/** One-click batch over the existing per-row analyze endpoint: strictly
 *  sequential (concurrency 1 respects the AI rate limiter), driven by a queue
 *  the caller supplies (already ordered — the documented triageWeight order a
 *  PPC manager should spend their evaluation clicks). Stopped by the first
 *  failure/429 (onAnalyze resolving `false`) or a user cancel. Extracted from
 *  CampaignTable so the render component keeps only markup. */
export function useBatchRunner(onAnalyze: (campaignId: string) => Promise<boolean> | void) {
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const cancelled = useRef(false);

  const runBatch = async (queue: string[]) => {
    if (batch) return;
    if (queue.length === 0) return;
    cancelled.current = false;
    setBatch({ done: 0, total: queue.length });
    try {
      for (let i = 0; i < queue.length; i++) {
        if (cancelled.current) break;
        const ok = await onAnalyze(queue[i]!);
        setBatch({ done: i + 1, total: queue.length });
        if (ok === false) break;
      }
    } finally {
      setBatch(null);
    }
  };

  const cancelBatch = () => {
    cancelled.current = true;
  };

  return { batch, runBatch, cancelBatch };
}
