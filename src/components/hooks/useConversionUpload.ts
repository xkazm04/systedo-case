"use client";

/** The choreography behind the "Nahrávání konverzí do Google Ads" settings card —
 *  extracted so the card stays under the 200-line component ceiling and the part with
 *  the real edge cases is readable on its own. Sits beside `useWebhookEndpoints`, the
 *  settings hook it most resembles.
 *
 *  It holds NO authorisation state of its own. `approve` is not a local flag the card
 *  flips — it is a POST whose refusal (no dry run, or one older than 24 h) comes back
 *  from the server as a message this hook simply shows. The button's `disabled` here
 *  is a courtesy so the operator is not sent into a refusal; the RULE lives on the
 *  server, and a hand-crafted POST hits exactly the same gate. */
import { useCallback, useEffect, useState } from "react";

export interface ConversionActionOption {
  resourceName: string;
  name: string;
  type: string;
  status: string;
}

export interface UploadMappingView {
  status: "draft" | "dry-run" | "approved" | "paused";
  conversionAction?: { resourceName: string; name: string };
  kinds: { qualified: boolean; won: boolean };
  dryRunAt?: string;
  dryRunRows?: number;
  dryRunValidated?: boolean | null;
  approvedAt?: string;
  pausedAt?: string;
  lastDrain?: { at: string; uploaded: number; failed: number; batchId: string };
  updatedAt: string;
}

/** One row exactly as it would go on the wire — the dry-run table's rows ARE the
 *  payload, never a re-rendering of it. */
export interface UploadRowView {
  gclid: string;
  conversionDateTime: string;
  conversionValue?: number;
  currencyCode: string;
}

export interface DryRunView {
  rows: number;
  dropped: number;
  validated: boolean | null;
  sample: UploadRowView[];
}

/** Why the live account could not be read, straight from the route. */
export type LiveReason = "not-configured" | "not-connected" | "no-token" | "unreachable" | null;

export interface ConversionUploadState {
  mapping: UploadMappingView | null;
  actions: ConversionActionOption[];
  reason: LiveReason;
  dryRun: DryRunView | null;
  busy: "select" | "dry-run" | "approve" | "pause" | null;
  failed: boolean;
  notice: string | null;
}

const EMPTY: ConversionUploadState = {
  mapping: null,
  actions: [],
  reason: null,
  dryRun: null,
  busy: null,
  failed: false,
  notice: null,
};

export function useConversionUpload(projectId: string) {
  const base = `/api/projects/${projectId}/conversions/upload`;
  const [state, setState] = useState<ConversionUploadState>(EMPTY);
  const merge = useCallback(
    (p: Partial<ConversionUploadState>) => setState((s) => ({ ...s, ...p })),
    []
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(base);
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as {
        mapping: UploadMappingView;
        actions: ConversionActionOption[];
        reason: LiveReason;
      };
      merge({ mapping: data.mapping, actions: data.actions ?? [], reason: data.reason, failed: false });
    } catch {
      merge({ failed: true });
    }
  }, [base, merge]);

  useEffect(() => {
    // Mount-time fetch: `load` is async and every setState it makes happens after an
    // await, so this is the "subscribe to an external system" case the rule allows —
    // the analyzer just cannot see through the async boundary (the repo-wide pattern).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** POST one action and fold the answer in. A refusal is SHOWN, never swallowed:
   *  "approve refused because your dry run is stale" is the single most important
   *  sentence this card can say, and hiding it behind a generic error would leave the
   *  operator clicking a button that silently does nothing. */
  const post = useCallback(
    async (
      action: "select" | "dry-run" | "approve" | "pause",
      payload: Record<string, unknown>,
      fallbackError: string
    ) => {
      merge({ busy: action, notice: null });
      try {
        const res = await fetch(base, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const data = (await res.json().catch(() => null)) as
          | ({ mapping?: UploadMappingView; error?: string } & Partial<DryRunView>)
          | null;
        if (!res.ok || !data?.mapping) {
          merge({ busy: null, notice: data?.error ?? fallbackError });
          return;
        }
        merge({
          mapping: data.mapping,
          busy: null,
          // A fresh dry run replaces the table; every other action clears it, because
          // a table left standing beside a changed mapping is a table that no longer
          // describes what would be sent.
          dryRun:
            action === "dry-run"
              ? {
                  rows: data.rows ?? 0,
                  dropped: data.dropped ?? 0,
                  validated: data.validated ?? null,
                  sample: data.sample ?? [],
                }
              : null,
        });
      } catch {
        merge({ busy: null, notice: fallbackError });
      }
    },
    [base, merge]
  );

  return { ...state, load, post };
}
