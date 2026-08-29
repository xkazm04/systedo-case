"use client";

/** Nastavení → "Odchozí webhooky": up to three signed destinations for this project's
 *  alerts, digests and reports. Three things it is careful about: the signing secret
 *  is shown ONCE (the server cannot re-issue it, and saying so while it is on screen
 *  is the difference between a copied secret and a support ticket); "Odeslat test"
 *  goes through the REAL pipeline (same SSRF guard, same signature, same log row), so
 *  a green test is evidence about production; and event types render as their WIRE
 *  VALUES, because this card configures a machine contract and the string the
 *  receiver branches on is the string its owner needs to see. Load/save/test
 *  choreography lives in `useWebhookEndpoints`; the log is a sibling component. */

import { Button, Pill } from "@/components/ui";
import { useProject } from "@/lib/projects/context";
import { useT } from "@/lib/i18n/client";
import { MAX_ENDPOINTS, OUTBOUND_EVENT_TYPES, type OutboundEventType } from "@/lib/outbound/event-types";
import { useWebhookEndpoints, type EndpointDraft } from "@/components/hooks/useWebhookEndpoints";
import WebhookDeliveryLog from "./WebhookDeliveryLog";

const T = {
  cs: {
    title: "Odchozí webhooky",
    subtitle:
      "Každé kritické upozornění, týdenní souhrn a odeslaný report tohoto projektu pošleme na vaši adresu jako podepsaný JSON. Nejvýše 3 cíle.",
    urlLabel: "Adresa (https)",
    add: "Přidat cíl",
    save: "Uložit",
    saving: "Ukládám…",
    test: "Odeslat test",
    testing: "Odesílám…",
    remove: "Odebrat",
    enabled: "Aktivní",
    disabled: "Vypnuto",
    events: "Události",
    lastOk: "Poslední doručení OK",
    lastFailed: "Poslední doručení selhalo",
    never: "Zatím nic neodesláno",
    secretTitle: "Podpisové tajemství — zobrazíme jen teď",
    secretBody:
      "Uložte si ho hned. Ověřuje hlavičku X-Adamant-Signature (HMAC-SHA256 z „časové razítko.tělo“). Znovu ho už nezobrazíme.",
    empty: "Zatím nemáte žádný cíl. Přidejte adresu a začneme posílat.",
    cryptoMissing:
      "Server nemá nastavený klíč WEBHOOK_SECRET_KEY, takže tajemství nelze bezpečně uložit. Cíle zatím nejde přidat.",
    testSent: "Test odeslán: {delivered} z {matched} cílů přijalo.",
    loadError: "Nastavení webhooků se nepodařilo načíst.",
    retry: "Zkusit znovu",
    max: "Dosáhli jste maxima 3 cílů.",
  },
  en: {
    title: "Outgoing webhooks",
    subtitle:
      "Every critical alert, weekly digest and delivered report for this project is POSTed to your URL as signed JSON. Up to 3 destinations.",
    urlLabel: "URL (https)",
    add: "Add destination",
    save: "Save",
    saving: "Saving…",
    test: "Send test",
    testing: "Sending…",
    remove: "Remove",
    enabled: "Active",
    disabled: "Off",
    events: "Events",
    lastOk: "Last delivery OK",
    lastFailed: "Last delivery failed",
    never: "Nothing sent yet",
    secretTitle: "Signing secret — shown only now",
    secretBody:
      "Save it now. It verifies the X-Adamant-Signature header (HMAC-SHA256 over “timestamp.body”). We cannot show it again.",
    empty: "No destination yet. Add a URL and we'll start sending.",
    cryptoMissing:
      "The server has no WEBHOOK_SECRET_KEY, so a secret cannot be stored safely. Destinations can't be added yet.",
    testSent: "Test sent: {delivered} of {matched} destinations accepted.",
    loadError: "Couldn't load the webhook settings.",
    retry: "Try again",
    max: "You've reached the maximum of 3 destinations.",
  },
} as const;

const INPUT =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";

export default function WebhookEndpoints() {
  const project = useProject();
  const t = useT(T);
  const w = useWebhookEndpoints(project.id);

  const patch = (i: number, p: Partial<EndpointDraft>) =>
    w.setDrafts((d) => d.map((row, j) => (j === i ? { ...row, ...p } : row)));

  // Toggling the last unchecked type collapses the array back to "all", so an
  // endpoint subscribed to everything keeps receiving types added in a later release
  // instead of silently freezing at today's list.
  const toggleEvent = (i: number, type: OutboundEventType) =>
    w.setDrafts((d) =>
      d.map((row, j) => {
        if (j !== i) return row;
        const list: OutboundEventType[] = row.events === "all" ? [...OUTBOUND_EVENT_TYPES] : row.events;
        const next = list.includes(type) ? list.filter((x) => x !== type) : [...list, type];
        return { ...row, events: next.length === OUTBOUND_EVENT_TYPES.length ? "all" : next };
      })
    );

  if (w.failed) {
    return (
      <section className="mt-8 max-w-2xl">
        <div className="card flex flex-wrap items-center justify-between gap-3 p-6">
          <p className="text-sm text-negative" role="alert">{t("loadError")}</p>
          <Button variant="secondary" size="sm" onClick={() => void w.load()}>{t("retry")}</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 max-w-2xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-ink">{t("title")}</h3>
        <p className="mt-0.5 text-sm text-muted">{t("subtitle")}</p>
      </div>

      <div className="card space-y-4 p-6">
        {!w.cryptoReady && (
          <p className="rounded-lg bg-negative-soft px-3.5 py-2.5 text-sm text-negative" role="alert">
            {t("cryptoMissing")}
          </p>
        )}
        {Object.entries(w.secrets).map(([id, plain]) => (
          <div key={id} className="rounded-lg border border-brand-300 bg-brand-50 px-3.5 py-3">
            <p className="text-xs font-semibold text-ink">{t("secretTitle")}</p>
            <p className="mt-1 break-all font-mono text-xs text-ink">{plain}</p>
            <p className="mt-1.5 text-xs text-muted">{t("secretBody")}</p>
          </div>
        ))}
        {w.drafts.length === 0 && <p className="text-sm text-muted">{t("empty")}</p>}
        {w.drafts.map((row, i) => {
          const saved = w.stored.find((e) => e.id === row.id);
          return (
            <div key={row.id ?? `new-${i}`} className="rounded-lg border border-line p-4">
              <label className="block">
                <span className="text-xs font-medium text-muted">{t("urlLabel")}</span>
                <input className={INPUT} value={row.url} placeholder="https://example.com/hooks/adamant" onChange={(e) => patch(i, { url: e.target.value })} />
              </label>
              <p className="mt-3 text-xs font-medium text-muted">{t("events")}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                {OUTBOUND_EVENT_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-1.5 font-mono text-xs text-ink">
                    <input type="checkbox" checked={row.events === "all" || row.events.includes(type)} onChange={() => toggleEvent(i, type)} />
                    {type}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-ink">
                  <input type="checkbox" checked={row.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} />
                  {row.enabled ? t("enabled") : t("disabled")}
                </label>
                {saved?.lastStatus ? (
                  <Pill tone={saved.lastStatus === "ok" ? "positive" : "negative"}>
                    {saved.lastStatus === "ok" ? t("lastOk") : t("lastFailed")}
                  </Pill>
                ) : (
                  saved && <Pill tone="neutral">{t("never")}</Pill>
                )}
                <Button variant="ghost" size="sm" onClick={() => w.setDrafts((d) => d.filter((_, j) => j !== i))}>
                  {t("remove")}
                </Button>
              </div>
            </div>
          );
        })}

        {w.notice && <p className="text-sm text-muted" role="status">{w.notice}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!w.cryptoReady || w.drafts.length >= MAX_ENDPOINTS}
            onClick={() => w.setDrafts((d) => [...d, { url: "", events: "all", enabled: true }])}
          >
            {t("add")}
          </Button>
          <Button variant="primary" size="sm" disabled={w.busy !== null} onClick={() => void w.save(w.drafts, t("loadError"))}>
            {w.busy === "save" ? t("saving") : t("save")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={w.busy !== null || w.stored.length === 0}
            onClick={() => void w.sendTest((r) => t("testSent", { delivered: String(r.delivered), matched: String(r.matched) }), t("loadError"))}
          >
            {w.busy === "test" ? t("testing") : t("test")}
          </Button>
          {w.drafts.length >= MAX_ENDPOINTS && <span className="text-xs text-muted">{t("max")}</span>}
        </div>
      </div>

      <WebhookDeliveryLog projectId={project.id} />
    </section>
  );
}
