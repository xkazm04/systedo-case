"use client";
/** Sequential batch runner for catalog ad-copy generation. Drives the SAME /api/ai
 *  `ads` path the interactive single generation uses — one awaited request at a time,
 *  so there is NO quota bypass and NO parallel hammering of the endpoint: the server
 *  meters quota per call exactly as it does for a single generation, and the for-loop
 *  below keeps strictly one request in flight. A failed item is recorded and the batch
 *  continues (it does not abort the run); `retryItem` re-runs a single SKU. Each
 *  success is persisted server-side (saveAdCopyAction) before the loop moves on. */
import { useCallback, useRef, useState } from "react";
import type { AdResponse } from "@/lib/ai-types";
import type { Product } from "@/lib/catalog/sample";
import { adRequestForProduct, type StoredAdCopy } from "@/lib/catalog/ad-copy";
import { AI_TIMEOUT_MS } from "@/components/ai/useAiTool";
import { saveAdCopyAction } from "./ad-copy-actions";

export type BatchItemState = "pending" | "running" | "done" | "failed";

export interface BatchProgress {
  running: boolean;
  /** total items in the current/last run. */
  total: number;
  /** per-SKU state; absent = not part of the current run. */
  status: Record<string, BatchItemState>;
  /** per-SKU failure message, for the retry affordance. */
  error: Record<string, string>;
}

const emptyProgress = (): BatchProgress => ({ running: false, total: 0, status: {}, error: {} });

/** POST one `ads` generation through /api/ai, mirroring useAiTool's request (mode +
 *  projectId injection + abort/timeout). Throws on a non-OK envelope so the caller can
 *  mark the item failed. */
async function postAds(product: Product, projectId: string | undefined): Promise<AdResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ads",
        ...adRequestForProduct(product),
        ...(projectId ? { projectId } : {}),
      }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : "Generování selhalo");
    return json as AdResponse;
  } finally {
    clearTimeout(timer);
  }
}

/** Turn a successful response into a persistable entry (with model provenance). */
function toStored(product: Product, resp: AdResponse): StoredAdCopy {
  return {
    sku: product.sku,
    result: resp.result,
    generatedAt: new Date().toISOString(),
    model: resp.meta.provider || resp.meta.model || "demo",
    demo: resp.meta.demo === true,
  };
}

export interface AdCopyBatch {
  progress: BatchProgress;
  /** Generate copy for every product in order, persisting each success. `onSaved` lets
   *  the module fold the new entry into its in-memory persisted map immediately. */
  runBatch: (products: Product[], projectId: string | undefined, onSaved: (e: StoredAdCopy) => void) => Promise<void>;
  /** Re-run a single SKU (the retry affordance). */
  retryItem: (product: Product, projectId: string | undefined, onSaved: (e: StoredAdCopy) => void) => Promise<void>;
  /** Stop after the in-flight item finishes. */
  cancel: () => void;
  reset: () => void;
}

export function useAdCopyBatch(): AdCopyBatch {
  const [progress, setProgress] = useState<BatchProgress>(emptyProgress);
  const cancelRef = useRef(false);

  const runOne = useCallback(
    async (product: Product, projectId: string | undefined, onSaved: (e: StoredAdCopy) => void) => {
      setProgress((p) => ({ ...p, status: { ...p.status, [product.sku]: "running" }, error: omit(p.error, product.sku) }));
      try {
        const resp = await postAds(product, projectId);
        const entry = toStored(product, resp);
        // Persist server-side before marking done, so a reload reflects reality. A
        // persistence hiccup shouldn't lose the just-generated copy — surface the entry
        // to the module regardless; the failure only means it won't survive a reload.
        try {
          await saveAdCopyAction(projectId ?? "", product.sku, entry);
        } catch {
          /* keep the in-memory copy; persistence is best-effort */
        }
        onSaved(entry);
        setProgress((p) => ({ ...p, status: { ...p.status, [product.sku]: "done" } }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generování selhalo";
        setProgress((p) => ({
          ...p,
          status: { ...p.status, [product.sku]: "failed" },
          error: { ...p.error, [product.sku]: message },
        }));
      }
    },
    []
  );

  const runBatch = useCallback(
    async (products: Product[], projectId: string | undefined, onSaved: (e: StoredAdCopy) => void) => {
      if (products.length === 0) return;
      cancelRef.current = false;
      const status: Record<string, BatchItemState> = {};
      for (const p of products) status[p.sku] = "pending";
      setProgress({ running: true, total: products.length, status, error: {} });
      for (const p of products) {
        if (cancelRef.current) break;
        await runOne(p, projectId, onSaved);
      }
      setProgress((p) => ({ ...p, running: false }));
    },
    [runOne]
  );

  const retryItem = useCallback(
    async (product: Product, projectId: string | undefined, onSaved: (e: StoredAdCopy) => void) => {
      await runOne(product, projectId, onSaved);
    },
    [runOne]
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setProgress(emptyProgress());
  }, []);

  return { progress, runBatch, retryItem, cancel, reset };
}

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  if (!(key in obj)) return obj;
  const rest = { ...obj };
  delete rest[key];
  return rest;
}
