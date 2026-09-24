"use client";

/** One row of the webhook delivery log: which destination, what happened, and — for a
 *  settled row — the verb. A `gave-up` delivery is no longer a dead end: "Redeliver"
 *  replays it as a NEW row (same event id, same signed bytes; the original stays as
 *  history). A delivered row can be replayed too (a receiver that lost what it
 *  accepted). A row the queue still owns (`pending`, `sending`) offers nothing — a
 *  second send while a retry is scheduled would deliver the event twice at once.
 *
 *  Extracted from WebhookDeliveryLog.tsx to keep both under the component ceiling. */

import { Button, Pill } from "@/components/ui";
import type { PillTone } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { PublicDelivery, PublicWebhookEndpoint } from "@/lib/outbound/types";

const T = {
  cs: {
    colType: "Událost",
    colEndpoint: "Cíl",
    colStatus: "Stav",
    colAttempts: "Pokusů",
    colCode: "Kód",
    colNext: "Další pokus",
    ok: "Doručeno",
    pending: "Čeká na opakování",
    sending: "Odesílá se",
    failed: "Selhalo",
    gaveUp: "Vzdáno",
    noCode: "bez odpovědi",
    redeliver: "Odeslat znovu",
    redelivering: "Odesílám…",
    replay: "opakování",
  },
  en: {
    colType: "Event",
    colEndpoint: "Destination",
    colStatus: "Status",
    colAttempts: "Attempts",
    colCode: "Code",
    colNext: "Next try",
    ok: "Delivered",
    pending: "Retry scheduled",
    sending: "Sending",
    failed: "Failed",
    gaveUp: "Gave up",
    noCode: "no response",
    redeliver: "Redeliver",
    redelivering: "Sending…",
    replay: "replay",
  },
} as const;

const TONE: Record<PublicDelivery["status"], PillTone> = {
  ok: "positive",
  pending: "coral",
  sending: "neutral",
  failed: "negative",
  "gave-up": "negative",
};

const LABEL: Record<PublicDelivery["status"], keyof (typeof T)["cs"]> = {
  ok: "ok",
  pending: "pending",
  sending: "sending",
  failed: "failed",
  "gave-up": "gaveUp",
};

/** "#2 hooks.example.com" — the position in the settings card plus the host, so a
 *  row is attributable at a glance; a deleted destination reads as a dash. */
export function labelFor(endpoints: PublicWebhookEndpoint[], id: string): string {
  const i = endpoints.findIndex((e) => e.id === id);
  if (i < 0) return "—";
  let host = endpoints[i].url;
  try {
    host = new URL(host).host;
  } catch {
    /* keep the raw url */
  }
  return `#${i + 1} ${host}`;
}

export function DeliveryTableHead() {
  const t = useT(T);
  return (
    <thead className="text-muted">
      <tr>
        {(["colType", "colEndpoint", "colStatus", "colAttempts", "colCode", "colNext"] as const).map((k) => (
          <th key={k} className="py-1.5 pr-3 font-medium">{t(k)}</th>
        ))}
        <th className="py-1.5" />
      </tr>
    </thead>
  );
}

export interface WebhookDeliveryRowProps {
  d: PublicDelivery;
  /** "#1 hooks.example.com", or a dash when the destination was deleted */
  endpointLabel: string;
  /** the row is settled AND its destination exists and is switched on */
  canRedeliver: boolean;
  acting: boolean;
  onRedeliver: () => void;
}

export default function WebhookDeliveryRow({ d, endpointLabel, canRedeliver, acting, onRedeliver }: WebhookDeliveryRowProps) {
  const t = useT(T);
  const fmt = useFormatters();
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2 pr-3 font-mono">
        {d.type}
        {d.redeliveryOf && <span className="ml-1.5 font-sans text-muted">· {t("replay")}</span>}
      </td>
      <td className="py-2 pr-3 break-all text-muted">{endpointLabel}</td>
      <td className="py-2 pr-3">
        <Pill tone={TONE[d.status]}>{t(LABEL[d.status])}</Pill>
        {d.lastError && <p className="mt-1 max-w-xs text-muted">{d.lastError}</p>}
      </td>
      <td className="py-2 pr-3">{d.attempts}</td>
      <td className="py-2 pr-3">{d.lastCode ?? t("noCode")}</td>
      <td className="py-2 pr-3">{d.nextAt ? fmt.fmtRelative(d.nextAt) : "—"}</td>
      <td className="py-2 text-right">
        {canRedeliver && (
          <Button variant="ghost" size="sm" disabled={acting} onClick={onRedeliver}>
            {acting ? t("redelivering") : t("redeliver")}
          </Button>
        )}
      </td>
    </tr>
  );
}
