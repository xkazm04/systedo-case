"use client";

/** The delivery log under the webhook settings card: what we actually sent, what the
 *  receiver answered, and when the next retry is due.
 *
 *  This exists because a webhook that "should be working" is otherwise unfalsifiable
 *  from the owner's side — they see nothing on their end and we show nothing on ours.
 *  Four columns make the failure legible: the HTTP code separates "your endpoint said
 *  no" from "we never reached it" (no code = guard refusal, DNS, TLS or timeout), and
 *  `attempts` + `next` show the retry is still coming rather than silently lost.
 *  With up to three destinations, each row names its endpoint and a chip per
 *  endpoint filters the log to one; a settled row offers "Redeliver" (the POST verb).
 *  The loaded rows are handed up (`onRows`) so the card derives each endpoint's
 *  standing from the same log instead of a second fetch.
 *
 *  Extracted from WebhookEndpoints.tsx to keep both under the component ceiling. */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { canRedeliver } from "@/lib/outbound/endpoint-health";
import type { PublicDelivery, PublicWebhookEndpoint } from "@/lib/outbound/types";
import WebhookDeliveryRow, { DeliveryTableHead, labelFor } from "./WebhookDeliveryRow";

const T = {
  cs: {
    title: "Historie doručení",
    empty: "Zatím nic neodesláno.",
    all: "Vše",
    redeliverError: "Doručení se nepodařilo odeslat znovu.",
    clear: "Vymazat historii",
    clearing: "Mažu…",
    reload: "Načíst znovu",
    loadError: "Historii se nepodařilo načíst.",
  },
  en: {
    title: "Delivery history",
    empty: "Nothing sent yet.",
    all: "All",
    redeliverError: "Couldn't redeliver.",
    clear: "Clear history",
    clearing: "Clearing…",
    reload: "Reload",
    loadError: "Couldn't load the history.",
  },
} as const;

export default function WebhookDeliveryLog({ projectId, endpoints, onRows }: {
  projectId: string;
  endpoints: PublicWebhookEndpoint[];
  onRows?: (rows: PublicDelivery[]) => void;
}) {
  const t = useT(T);
  const [rows, setRowsState] = useState<PublicDelivery[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const url = `/api/projects/${projectId}/webhooks/deliveries`;
  const setRows = useCallback(
    (next: PublicDelivery[]) => {
      setRowsState(next);
      onRows?.(next);
    },
    [onRows]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as { deliveries: PublicDelivery[] };
      setRows(data.deliveries);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [url, setRows]);

  useEffect(() => {
    // Mount-time fetch: `load` is async and every setState it makes happens after an
    // await, so this is the "subscribe to an external system" case the rule allows —
    // the analyzer just cannot see through the async boundary (the repo-wide pattern,
    // see SavedKeywordLists.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function clear() {
    setBusy(true);
    try {
      await fetch(url, { method: "DELETE" });
      setRows([]);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  /** Replay one settled row; the new row lands on top with its first attempt's outcome. */
  async function redeliver(id: string) {
    setActing(id);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redeliver: id }),
      });
      const data = (await res.json()) as { delivery?: PublicDelivery; error?: string };
      if (res.ok && data.delivery) setRows([data.delivery, ...(rows ?? [])]);
      else setNotice(data.error ?? t("redeliverError"));
    } catch {
      setNotice(t("redeliverError"));
    } finally {
      setActing(null);
    }
  }

  const shown = rows && filter ? rows.filter((d) => d.endpointId === filter) : rows;
  const live = (id: string) => endpoints.some((e) => e.id === id && e.enabled);

  if (failed) {
    return (
      <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-6">
        <p className="text-sm text-negative" role="alert">{t("loadError")}</p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>{t("reload")}</Button>
      </div>
    );
  }

  return (
    <div className="card mt-4 p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{t("title")}</h4>
        {rows && rows.length > 0 && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void clear()}>
            {busy ? t("clearing") : t("clear")}
          </Button>
        )}
      </div>

      {endpoints.length > 1 && rows && rows.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[null, ...endpoints.map((e) => e.id)].map((id) => (
            <Button key={id ?? "all"} variant={filter === id ? "secondary" : "ghost"} size="sm" onClick={() => setFilter(id)}>
              {id ? labelFor(endpoints, id) : t("all")}
            </Button>
          ))}
        </div>
      )}
      {notice && <p className="mb-2 text-sm text-negative" role="alert">{notice}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-muted">{t("empty")}</p>}

      {shown && shown.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <DeliveryTableHead />
            <tbody className="text-ink">
              {shown.map((d) => (
                <WebhookDeliveryRow
                  key={d.id}
                  d={d}
                  endpointLabel={labelFor(endpoints, d.endpointId)}
                  canRedeliver={canRedeliver(d) && live(d.endpointId)}
                  acting={acting === d.id}
                  onRedeliver={() => void redeliver(d.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
