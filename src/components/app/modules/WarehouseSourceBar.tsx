/** Direction 2 — the warehouse-source header for the Sklad & sezónnost module.
 *  Connected: shows the live provider, sync freshness and what the link unlocks
 *  (margins, velocity, restock from the ERP/3PL). Not connected: the connector
 *  picker — the hub / 3PL / ERP back-ends a shop can link. Server component. */
import { Pill } from "@/components/ui";
import { Box, Check, Link as LinkIcon, Network, Refresh } from "@/components/icons";
import { getT } from "@/lib/i18n/server";
import {
  WAREHOUSE_PROVIDERS,
  type WarehouseConnection,
  type WarehouseKind,
  type WarehouseProviderMeta,
} from "@/lib/inventory/warehouse";

const T = {
  cs: {
    liveFrom: "Živě z {provider}",
    syncedAgo: "synchronizováno před {n} min",
    skuCount: "{n} SKU",
    connected: "Napojeno",
    unlocks: "Obrátka, marže (COGS) i naskladnění z POs tečou přímo ze skladu — ne z ručně udržovaných konstant.",
    demoNote: "Ukázkové napojení — v prototypu jsou čísla ilustrativní; ostrá synchronizace se připojí přes API konektor.",
    otherSources: "Další zdroje",
    change: "Změnit zdroj",
    // picker
    pickerTitle: "Napojte svůj sklad",
    pickerLead:
      "Skutečná dostupnost, marže a termíny naskladnění žijí ve vašem skladu — ne ve storefrontu. Napojte jeden konektor a modul přestane běžet na zamrzlých ukázkových datech.",
    connect: "Připojit",
    kindHub: "Multikanálový hub",
    kindHubNote: "Jedno API pokryje sklad i prodejní kanály",
    kind3pl: "Fulfillment (3PL)",
    kind3plNote: "Zásoby a příjem v reálném čase přes REST",
    kindErp: "ERP / účetnictví",
    kindErpNote: "Autoritativní sklad středních a velkých e-shopů",
    pickerFoot: "Prototyp — tlačítka zatím nevytvoří skutečné spojení.",
  },
  en: {
    liveFrom: "Live from {provider}",
    syncedAgo: "synced {n} min ago",
    skuCount: "{n} SKUs",
    connected: "Connected",
    unlocks: "Velocity, margin (COGS) and restock ETAs come straight from the warehouse — not hand-maintained constants.",
    demoNote: "Demo connection — numbers are illustrative in this prototype; a live sync connects via an API connector.",
    otherSources: "Other sources",
    change: "Change source",
    pickerTitle: "Connect your warehouse",
    pickerLead:
      "Real availability, margins and restock dates live in your warehouse — not the storefront. Link one connector and the module stops running on frozen sample data.",
    connect: "Connect",
    kindHub: "Multichannel hub",
    kindHubNote: "One API covers stock and sales channels",
    kind3pl: "Fulfillment (3PL)",
    kind3plNote: "Real-time stock and receiving over REST",
    kindErp: "ERP / accounting",
    kindErpNote: "Authoritative stock for mid & large e-shops",
    pickerFoot: "Prototype — the buttons don't create a real connection yet.",
  },
} as const;

/** A logo-free provider mark: initials on a tinted rounded square. */
function ProviderMark({ mark, active = false }: { mark: string; active?: boolean }) {
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[13px] font-bold tracking-tight ${
        active ? "bg-brand-600 text-white" : "bg-navy-50 text-navy-600"
      }`}
      aria-hidden
    >
      {mark}
    </span>
  );
}

export default async function WarehouseSourceBar({
  connection,
  skuCount,
}: {
  connection: WarehouseConnection | null;
  skuCount?: number;
}) {
  const t = await getT(T);

  if (connection) {
    const others = WAREHOUSE_PROVIDERS.filter((p) => p.id !== connection.provider.id);
    return (
      <div className="rounded-card border border-brand-200 bg-brand-50/50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ProviderMark mark={connection.provider.mark} active />
            <div>
              <p className="flex items-center gap-2 font-semibold text-navy-800">
                {t("liveFrom", { provider: connection.provider.label })}
                <Pill tone="positive">
                  <span className="flex items-center gap-1">
                    <Check width={12} height={12} aria-hidden />
                    {t("connected")}
                  </span>
                </Pill>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
                <span className="flex items-center gap-1">
                  <Refresh width={13} height={13} aria-hidden />
                  {t("syncedAgo", { n: connection.syncedMinsAgo })}
                </span>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1">
                  <Box width={13} height={13} aria-hidden />
                  {t("skuCount", { n: skuCount ?? 0 })}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="hidden sm:inline">{t("otherSources")}:</span>
            <span className="flex items-center gap-1">
              {others.map((p) => (
                <span
                  key={p.id}
                  title={p.label}
                  className="grid h-6 w-6 place-items-center rounded-md bg-surface text-[10px] font-semibold text-muted ring-1 ring-line"
                  aria-hidden
                >
                  {p.mark}
                </span>
              ))}
            </span>
          </div>
        </div>

        <p className="mt-3 border-t border-brand-200/70 pt-3 text-sm text-navy-700">{t("unlocks")}</p>
        <p className="mt-1.5 text-xs text-muted">{t("demoNote")}</p>
      </div>
    );
  }

  // --- not connected: the connector picker -------------------------------------
  const kinds: { kind: WarehouseKind; title: string; note: string; icon: React.ReactNode }[] = [
    { kind: "hub", title: t("kindHub"), note: t("kindHubNote"), icon: <Network width={15} height={15} /> },
    { kind: "3pl", title: t("kind3pl"), note: t("kind3plNote"), icon: <Box width={15} height={15} /> },
    { kind: "erp", title: t("kindErp"), note: t("kindErpNote"), icon: <LinkIcon width={15} height={15} /> },
  ];

  return (
    <div className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-onyx text-brand-400">
          <Box width={20} height={20} aria-hidden />
        </span>
        <div>
          <h3 className="text-base font-semibold text-navy-800">{t("pickerTitle")}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-navy-600">{t("pickerLead")}</p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {kinds.map(({ kind, title, note, icon }) => {
          const providers = WAREHOUSE_PROVIDERS.filter((p) => p.kind === kind);
          return (
            <div key={kind}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-brand-accent">{icon}</span>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
                <span className="text-xs text-muted">· {note}</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {providers.map((p) => (
                  <ProviderCard key={p.id} provider={p} connect={t("connect")} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 border-t border-line pt-3 text-xs text-muted">{t("pickerFoot")}</p>
    </div>
  );
}

function ProviderCard({ provider, connect }: { provider: WarehouseProviderMeta; connect: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-canvas px-3.5 py-3">
      <ProviderMark mark={provider.mark} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-800">{provider.label}</p>
        <p className="truncate text-xs text-muted">{provider.blurb}</p>
      </div>
      <button
        type="button"
        disabled
        className="shrink-0 rounded-pill border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-accent opacity-70"
      >
        {connect}
      </button>
    </div>
  );
}
