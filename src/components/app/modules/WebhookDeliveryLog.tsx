"use client";

/** The delivery log under the webhook settings card: what we actually sent, what the
 *  receiver answered, and when the next retry is due.
 *
 *  This exists because a webhook that "should be working" is otherwise unfalsifiable
 *  from the owner's side — they see nothing on their end and we show nothing on ours.
 *  Four columns make the failure legible: the HTTP code separates "your endpoint said
 *  no" from "we never reached it" (no code = guard refusal, DNS, TLS or timeout), and
 *  `attempts` + `next` show the retry is still coming rather than silently lost.
 *
 *  Extracted from WebhookEndpoints.tsx to keep both under the component ceiling. */

import { useCallback, useEffect, useState } from "react";
import { Button, Pill } from "@/components/ui";
import type { PillTone } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { PublicDelivery } from "@/lib/outbound/types";

const T = {
  cs: {
    title: "Historie doručení",
    empty: "Zatím nic neodesláno.",
    colType: "Událost",
    colStatus: "Stav",
    colAttempts: "Pokusů",
    colNext: "Další pokus",
    colCode: "Kód",
    ok: "Doručeno",
    pending: "Čeká na opakování",
    failed: "Selhalo",
    gaveUp: "Vzdáno",
    clear: "Vymazat historii",
    clearing: "Mažu…",
    reload: "Načíst znovu",
    loadError: "Historii se nepodařilo načíst.",
    noCode: "bez odpovědi",
  },
  en: {
    title: "Delivery history",
    empty: "Nothing sent yet.",
    colType: "Event",
    colStatus: "Status",
    colAttempts: "Attempts",
    colNext: "Next try",
    colCode: "Code",
    ok: "Delivered",
    pending: "Retry scheduled",
    failed: "Failed",
    gaveUp: "Gave up",
    clear: "Clear history",
    clearing: "Clearing…",
    reload: "Reload",
    loadError: "Couldn't load the history.",
    noCode: "no response",
  },
} as const;

const TONE: Record<PublicDelivery["status"], PillTone> = {
  ok: "positive",
  pending: "coral",
  failed: "negative",
  "gave-up": "negative",
};

const LABEL: Record<PublicDelivery["status"], keyof (typeof T)["cs"]> = {
  ok: "ok",
  pending: "pending",
  failed: "failed",
  "gave-up": "gaveUp",
};

export default function WebhookDeliveryLog({ projectId }: { projectId: string }) {
  const t = useT(T);
  const fmt = useFormatters();
  const [rows, setRows] = useState<PublicDelivery[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = `/api/projects/${projectId}/webhooks/deliveries`;

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
  }, [url]);

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

      {rows && rows.length === 0 && <p className="text-sm text-muted">{t("empty")}</p>}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{t("colType")}</th>
                <th className="py-1.5 pr-3 font-medium">{t("colStatus")}</th>
                <th className="py-1.5 pr-3 font-medium">{t("colAttempts")}</th>
                <th className="py-1.5 pr-3 font-medium">{t("colCode")}</th>
                <th className="py-1.5 font-medium">{t("colNext")}</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3 font-mono">{d.type}</td>
                  <td className="py-2 pr-3">
                    <Pill tone={TONE[d.status]}>{t(LABEL[d.status])}</Pill>
                    {d.lastError && <p className="mt-1 max-w-xs text-muted">{d.lastError}</p>}
                  </td>
                  <td className="py-2 pr-3">{d.attempts}</td>
                  <td className="py-2 pr-3">{d.lastCode ?? t("noCode")}</td>
                  <td className="py-2">{d.nextAt ? fmt.fmtRelative(d.nextAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
