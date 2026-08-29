"use client";

/** The data hook behind the "Odchozí webhooky" settings card. Extracted from the
 *  component so the card stays under the 200-line component ceiling and the
 *  load/save/test choreography — the part with the real edge cases — is readable on
 *  its own; it sits beside useByomConfig, the settings hook it most resembles.
 *
 *  It is deliberately NOT under src/lib/outbound: everything in that directory
 *  reaches the network through the SSRF-guarded sender, and "no bare fetch() lives
 *  here" is a grep-checked invariant of that seam. A browser hook calling our own
 *  API is a different thing and belongs on the component side of the line.
 *
 *  It deliberately holds NO secret state beyond the one-shot `secrets` map the PUT
 *  response hands back: the plaintext signing secret exists in this hook only until
 *  the next save, and is never re-fetched, because the server cannot re-issue it. */
import { useCallback, useEffect, useState } from "react";
import type { OutboundEventType } from "@/lib/outbound/event-types";
import type { PublicWebhookEndpoint } from "@/lib/outbound/types";

/** One row as the form holds it — an `id` means "edit the stored endpoint", its
 *  absence means "create one" (the server mints a secret for it). */
export interface EndpointDraft {
  id?: string;
  url: string;
  events: OutboundEventType[] | "all";
  enabled: boolean;
}

export interface WebhookEndpointsState {
  drafts: EndpointDraft[];
  stored: PublicWebhookEndpoint[];
  cryptoReady: boolean;
  /** endpointId → plaintext secret, present only immediately after the save that
   *  minted it. Rendered once, then lost with the next save. */
  secrets: Record<string, string>;
  busy: string | null;
  failed: boolean;
  /** last test result / server error, already human-readable */
  notice: string | null;
}

const toDraft = (e: PublicWebhookEndpoint): EndpointDraft => ({
  id: e.id,
  url: e.url,
  events: e.events,
  enabled: e.enabled,
});

export function useWebhookEndpoints(projectId: string) {
  const base = `/api/projects/${projectId}/webhooks`;
  const [state, setState] = useState<WebhookEndpointsState>({
    drafts: [],
    stored: [],
    cryptoReady: true,
    secrets: {},
    busy: null,
    failed: false,
    notice: null,
  });
  const merge = useCallback(
    (p: Partial<WebhookEndpointsState>) => setState((s) => ({ ...s, ...p })),
    []
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(base);
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as { endpoints: PublicWebhookEndpoint[]; cryptoReady: boolean };
      merge({
        stored: data.endpoints,
        drafts: data.endpoints.map(toDraft),
        cryptoReady: data.cryptoReady,
        failed: false,
      });
    } catch {
      merge({ failed: true });
    }
  }, [base, merge]);

  useEffect(() => {
    // Mount-time fetch: `load` is async and every setState it makes happens after an
    // await, so this is the "subscribe to an external system" case the rule allows —
    // the analyzer just cannot see through the async boundary (the repo-wide pattern,
    // see SavedKeywordLists.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Replace the stored list with `next`. A rejected save leaves the drafts exactly
   *  as typed (never silently reverted) so the owner can fix the one bad URL. */
  const save = useCallback(
    async (next: EndpointDraft[], fallbackError: string) => {
      merge({ busy: "save", notice: null });
      try {
        const res = await fetch(base, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoints: next }),
        });
        const data = (await res.json()) as {
          endpoints?: PublicWebhookEndpoint[];
          secrets?: Record<string, string>;
          error?: string;
        };
        if (!res.ok || !data.endpoints) {
          merge({ busy: null, notice: data.error ?? fallbackError });
          return;
        }
        merge({
          stored: data.endpoints,
          drafts: data.endpoints.map(toDraft),
          secrets: data.secrets && Object.keys(data.secrets).length > 0 ? data.secrets : {},
          busy: null,
        });
      } catch {
        merge({ busy: null, notice: fallbackError });
      }
    },
    [base, merge]
  );

  /** Fire a `ping` through the real pipeline and report what came back. */
  const sendTest = useCallback(
    async (say: (r: { delivered: number; matched: number }) => string, fallbackError: string) => {
      merge({ busy: "test", notice: null });
      try {
        const res = await fetch(`${base}/test`, { method: "POST" });
        const data = (await res.json()) as { delivered?: number; matched?: number; error?: string };
        merge({
          busy: null,
          notice: res.ok
            ? say({ delivered: data.delivered ?? 0, matched: data.matched ?? 0 })
            : (data.error ?? fallbackError),
        });
      } catch {
        merge({ busy: null, notice: fallbackError });
      }
      await load();
    },
    [base, load, merge]
  );

  const setDrafts = useCallback(
    (fn: (d: EndpointDraft[]) => EndpointDraft[]) =>
      setState((s) => ({ ...s, drafts: fn(s.drafts) })),
    []
  );

  return { ...state, load, save, sendTest, setDrafts };
}
