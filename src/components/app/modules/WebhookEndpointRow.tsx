"use client";

/** One destination in the "Odchozí webhooky" card: its URL, event filter, on/off
 *  switch, and its STANDING — derived from the delivery log by `endpointHealth`, not
 *  from the `lastStatus` stamp (which a retry that later succeeds never rewrites). A
 *  secret the server can no longer open (a server-key change) gets its own badge and
 *  makes "Rotate secret" the row's primary action; rotating re-mints only this row's
 *  secret and the card shows it once, in the existing reveal-once banner.
 *
 *  Extracted from WebhookEndpoints.tsx to keep both under the component ceiling. */

import { Button, Pill, type PillTone } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import { OUTBOUND_EVENT_TYPES, type OutboundEventType } from "@/lib/outbound/event-types";
import type { EndpointHealth, EndpointHealthState } from "@/lib/outbound/endpoint-health";
import type { EndpointDraft } from "@/components/hooks/useWebhookEndpoints";

const T = {
  cs: {
    urlLabel: "Adresa (https)",
    events: "Události",
    enabled: "Aktivní",
    disabled: "Vypnuto",
    remove: "Odebrat",
    idle: "Zatím nic neodesláno",
    healthy: "Doručuje",
    failing: "Selhává {n}×",
    failingSince: "Selhává {n}× · poslední úspěch {ago}",
    dead: "Nedostupný · {n} doručení vzdáno",
    unreadable: "Tajemství nelze otevřít",
    unreadableHint:
      "Klíč serveru se změnil, takže podpis nejde vytvořit a každé doručení selže. Vygenerujte nové tajemství a vložte ho do přijímače.",
    rotate: "Nové tajemství",
    rotateConfirm:
      "Vygenerovat pro tento cíl nové podpisové tajemství? Staré přestane platit hned a přijímač bude potřebovat to nové.",
  },
  en: {
    urlLabel: "URL (https)",
    events: "Events",
    enabled: "Active",
    disabled: "Off",
    remove: "Remove",
    idle: "Nothing sent yet",
    healthy: "Delivering",
    failing: "Failing {n}×",
    failingSince: "Failing {n}× · last success {ago}",
    dead: "Unreachable · {n} deliveries gave up",
    unreadable: "Secret can't be opened",
    unreadableHint:
      "The server key changed, so no delivery can be signed and every one fails. Rotate the secret and paste the new one into your receiver.",
    rotate: "Rotate secret",
    rotateConfirm:
      "Generate a new signing secret for this destination? The old one stops working at once and your receiver will need the new one.",
  },
} as const;

const TONE: Record<EndpointHealthState, PillTone> = {
  idle: "neutral",
  healthy: "positive",
  failing: "coral",
  dead: "negative",
  "secret-unreadable": "negative",
};

const INPUT =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";

export interface WebhookEndpointRowProps {
  row: EndpointDraft;
  /** null for a draft that has not been saved yet — it has no log and no secret */
  health: EndpointHealth | null;
  busy: boolean;
  onPatch: (p: Partial<EndpointDraft>) => void;
  onToggleEvent: (type: OutboundEventType) => void;
  onRemove: () => void;
  onRotate: () => void;
}

export default function WebhookEndpointRow(p: WebhookEndpointRowProps) {
  const t = useT(T);
  const fmt = useFormatters();
  const { row, health } = p;
  const n = String(health?.consecutiveFailures ?? 0);
  const label = !health
    ? null
    : health.state === "secret-unreadable"
      ? t("unreadable")
      : health.state === "failing"
        ? health.lastSuccessAt
          ? t("failingSince", { n, ago: fmt.fmtRelative(health.lastSuccessAt) })
          : t("failing", { n })
        : health.state === "dead"
          ? t("dead", { n })
          : t(health.state);
  const unreadable = health?.state === "secret-unreadable";

  function rotate() {
    if (window.confirm(t("rotateConfirm"))) p.onRotate();
  }

  return (
    <div className="rounded-lg border border-line p-4">
      <label className="block">
        <span className="text-xs font-medium text-muted">{t("urlLabel")}</span>
        <input className={INPUT} value={row.url} placeholder="https://example.com/hooks/adamant" onChange={(e) => p.onPatch({ url: e.target.value })} />
      </label>
      <p className="mt-3 text-xs font-medium text-muted">{t("events")}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {OUTBOUND_EVENT_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-1.5 font-mono text-xs text-ink">
            <input type="checkbox" checked={row.events === "all" || row.events.includes(type)} onChange={() => p.onToggleEvent(type)} />
            {type}
          </label>
        ))}
      </div>
      {unreadable && <p className="mt-3 rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative" role="alert">{t("unreadableHint")}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" checked={row.enabled} onChange={(e) => p.onPatch({ enabled: e.target.checked })} />
          {row.enabled ? t("enabled") : t("disabled")}
        </label>
        {health && label && <Pill tone={TONE[health.state]}>{label}</Pill>}
        {health && (
          <Button variant={unreadable ? "primary" : "ghost"} size="sm" disabled={p.busy} onClick={rotate}>
            {t("rotate")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={p.onRemove}>
          {t("remove")}
        </Button>
      </div>
    </div>
  );
}
