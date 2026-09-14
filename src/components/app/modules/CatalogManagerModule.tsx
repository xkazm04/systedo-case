"use client";

/** Katalog — the project's business catalog manager. A type-aware editor over the
 *  offering entity: products (e-shop), plans + competitors (app/SaaS) or services ×
 *  localities (lead-gen), plus each offering's pricing, margin and online/local
 *  nature. This is the source the smart modules (Sklad, Srovnání & SEO, Lokální,
 *  Zisk) read from. Edits persist per project (Save); a product feed (Heureka /
 *  Zboží.cz / Google / CSV) can be imported, and a warehouse/ERP (demo or Baselinker)
 *  can be connected + synced. Demo (`persistable=false`) stays session-only. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pill } from "@/components/ui";
import { Plus, Search } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { interpolate, type TFn } from "@/lib/i18n/interpolate";
import type { Locality, Offering, OfferingKind, OfferingNature } from "@/lib/catalog/offering";
import type { CatalogDiff } from "@/lib/catalog/import";
import { SYNC_PROVIDERS } from "@/lib/inventory/providers";
import type { PublicConnection } from "@/lib/inventory/connection-store";
import type { WarehouseConnection } from "@/lib/inventory/warehouse";
import type { ProjectType } from "@/lib/projects/types";
import type { IconKey } from "@/lib/projects/icon-keys";
import { OfferingCard, type OfferingCommit } from "./catalog/OfferingCard";
import { CATALOG_PAGE_SIZE, INPUT_BASE, offeringMatchesQuery } from "./catalog/offering-edit";

const T = {
  cs: {
    sessionNote: "Úpravy jsou zatím jen v této relaci. Perzistence a živá synchronizace WMS přijdou v další fázi.",
    manualCatalog: "Manuální katalog",
    liveFrom: "Živě z",
    offerings: "položek",
    add: "Přidat",
    save: "Uložit změny",
    saving: "Ukládám…",
    saved: "Uloženo",
    saveError: "Uložení selhalo",
    namePh: "Název",
    currencyUnit: "Kč",
    products: "Produkty",
    plans: "Plány",
    services: "Služby",
    online: "Online",
    local: "Lokální",
    hybrid: "Hybridní",
    active: "Aktivní",
    price: "Cena",
    margin: "Marže",
    stock: "Sklad",
    perDay: "/den",
    sku: "SKU",
    interval: "interval",
    month: "měsíčně",
    year: "ročně",
    oneOff: "jednorázově",
    from: "od",
    fixed: "fixně",
    quote: "na míru",
    rivals: "Konkurenti",
    areas: "Oblasti",
    capacity: "kapacita",
    week: "týd.",
    empty: "Zatím žádné položky. Přidejte první, nebo připojte zdroj.",
    remove: "Odebrat",
    importHeading: "Import feedu",
    importHint:
      "Zadejte URL feedu, nebo vložte XML/CSV (Heureka, Zboží.cz, Google Nákupy).",
    feedPlaceholder: "Sem vložte obsah feedu: XML nebo CSV…",
    strategyMerge: "Sloučit",
    strategyReplace: "Nahradit",
    strategyMergeHint: "Aktualizovat podle SKU, ruční položky ponechat",
    strategyReplaceHint: "Nahradit celý katalog položkami z feedu",
    preview: "Náhled",
    previewing: "Analyzuji…",
    runImport: "Importovat",
    importing: "Importuji…",
    imported: "Naimportováno",
    importFailed: "Import selhal",
    diffAdded: "nových",
    diffUpdated: "změněných",
    diffUnchanged: "beze změny",
    diffRemoved: "odebráno",
    urlLabel: "URL feedu",
    urlPlaceholder: "https://…/feed.xml",
    orPaste: "nebo vložte obsah ručně",
    tabFeed: "Feed",
    tabWarehouse: "Sklad / WMS",
    syncHint:
      "Synchronizujte katalog ze skladu (WMS) nebo ERP. Ukázkový sklad funguje bez přihlášení; Baselinker vyžaduje API token.",
    provider: "Poskytovatel",
    token: "API token",
    tokenPlaceholder: "Vložte API token…",
    comingSoon: "připravujeme",
    demoNote: "Ukázková data skladu, bez přihlašovacích údajů.",
    sync: "Synchronizovat",
    syncing: "Synchronizuji…",
    connect: "Připojit",
    connecting: "Připojuji…",
    connectedTo: "Připojeno:",
    lastSync: "poslední synchronizace",
    neverSynced: "zatím nesynchronizováno",
    syncFailedLabel: "Poslední synchronizace selhala",
    disconnect: "Odpojit",
    erpHint: "Napojte libovolné ERP/WMS přes HTTP endpoint vracející JSON nebo CSV.",
    erpEndpoint: "URL koncového bodu",
    erpFormat: "Formát",
    erpAuth: "Ověření",
    erpAuthNone: "Bez ověření",
    erpAuthHeader: "Vlastní hlavička",
    erpItemsPath: "Cesta k položkám (JSON)",
    erpMapping: "Mapování polí",
    erpMappingHint: "Názvy zdrojových polí z odpovědi ERP. SKU a název jsou povinné.",
    searchPh: "Hledat podle názvu, SKU, kategorie…",
    filterAll: "Vše",
    noMatches: "Žádné položky neodpovídají hledání.",
    loadMore: "Zobrazit další",
    showing: "Zobrazeno {shown} z {total}",
  },
  en: {
    sessionNote: "Edits are session-only for now. Persistence and live WMS sync land in the next phase.",
    manualCatalog: "Manual catalog",
    liveFrom: "Live from",
    offerings: "items",
    add: "Add",
    save: "Save changes",
    saving: "Saving…",
    saved: "Saved",
    saveError: "Save failed",
    namePh: "Name",
    // Catalog prices are koruny in both locales; Czech writes "Kč", English "CZK"
    // (operator ruling 2026-09-14, docs/i18n/style-en.md).
    currencyUnit: "CZK",
    products: "Products",
    plans: "Plans",
    services: "Services",
    online: "Online",
    local: "Local",
    hybrid: "Hybrid",
    active: "Active",
    price: "Price",
    margin: "Margin",
    stock: "Stock",
    perDay: "/day",
    sku: "SKU",
    interval: "interval",
    month: "monthly",
    year: "yearly",
    oneOff: "one-off",
    from: "from",
    fixed: "fixed",
    quote: "quote",
    rivals: "Rivals",
    areas: "Areas",
    capacity: "capacity",
    week: "wk",
    empty: "No items yet. Add the first, or connect a source.",
    remove: "Remove",
    importHeading: "Import feed",
    importHint:
      "Enter a feed URL, or paste XML/CSV (Heureka, Zboží.cz, Google Shopping).",
    feedPlaceholder: "Paste the feed content here: XML or CSV…",
    strategyMerge: "Merge",
    strategyReplace: "Replace",
    strategyMergeHint: "Update by SKU, keep manual items",
    strategyReplaceHint: "Replace the whole catalog with the feed",
    preview: "Preview",
    previewing: "Analyzing…",
    runImport: "Import",
    importing: "Importing…",
    imported: "Imported",
    importFailed: "Import failed",
    diffAdded: "new",
    diffUpdated: "updated",
    diffUnchanged: "unchanged",
    diffRemoved: "removed",
    urlLabel: "Feed URL",
    urlPlaceholder: "https://…/feed.xml",
    orPaste: "or paste the content",
    tabFeed: "Feed",
    tabWarehouse: "Warehouse / WMS",
    syncHint:
      "Sync your catalog from a warehouse (WMS) or ERP. The sample warehouse works with no login; Baselinker needs an API token.",
    provider: "Provider",
    token: "API token",
    tokenPlaceholder: "Paste the API token…",
    comingSoon: "coming soon",
    demoNote: "Sample warehouse data, no credentials.",
    sync: "Sync",
    syncing: "Syncing…",
    connect: "Connect",
    connecting: "Connecting…",
    connectedTo: "Connected:",
    lastSync: "last sync",
    neverSynced: "not synced yet",
    syncFailedLabel: "Last sync failed",
    disconnect: "Disconnect",
    erpHint: "Connect any ERP/WMS via an HTTP endpoint returning JSON or CSV.",
    erpEndpoint: "Endpoint URL",
    erpFormat: "Format",
    erpAuth: "Auth",
    erpAuthNone: "None",
    erpAuthHeader: "Custom header",
    erpItemsPath: "Items path (JSON)",
    erpMapping: "Field mapping",
    erpMappingHint: "Source field names from the ERP response. SKU and name are required.",
    searchPh: "Search by name, SKU, category…",
    filterAll: "All",
    noMatches: "No items match your search.",
    loadMore: "Show more",
    showing: "Showing {shown} of {total}",
  },
} as const;

/** The translator type for this module's cs/en table — exported so the extracted
 *  OfferingCard can type its stable `t` prop against the same keys. */
export type CatalogT = TFn<keyof (typeof T)["cs"]>;

const KIND_META: Record<OfferingKind, { titleKey: "products" | "plans" | "services"; icon: IconKey }> = {
  product: { titleKey: "products", icon: "catalog" },
  plan: { titleKey: "plans", icon: "app" },
  service: { titleKey: "services", icon: "local" },
};

const inputBase = INPUT_BASE;

const PRIMARY_KIND: Record<ProjectType, OfferingKind> = {
  eshop: "product",
  app: "plan",
  leadgen: "service",
  content: "service",
  local: "service",
};

export default function CatalogManagerModule({
  offerings,
  connection,
  localities,
  projectType,
  projectName,
  projectId,
  persistable = false,
}: {
  offerings: Offering[];
  connection: WarehouseConnection | null;
  localities: Locality[];
  projectType: ProjectType;
  projectName: string;
  projectId: string;
  /** When true, "Save" persists to /api/projects/[id]/catalog; else session-only (demo). */
  persistable?: boolean;
}) {
  // A locale-memoized translator (same behaviour as useT) with a STABLE identity per
  // locale — so the memoized OfferingCard re-renders on a real locale change but not on
  // every parent render (search typing, a sibling's commit).
  const { locale } = useLocale();
  const t = useMemo<CatalogT>(() => {
    const table = T[locale] ?? T.cs;
    return (key, vars) => interpolate(table[key] ?? T.cs[key] ?? key, vars);
  }, [locale]);

  const [items, setItemsState] = useState<Offering[]>(offerings);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Any edit drops us back to "idle" so a stale "Saved" never lingers.
  const setItems = (u: Offering[] | ((prev: Offering[]) => Offering[])) => {
    setItemsState(u);
    setSaveState("idle");
  };

  // Search + kind filter + "show N + load more" pagination, so the manager scales to a
  // real shop. Below CATALOG_PAGE_SIZE items with no query/filter the list is identical
  // to before (visibleCount ≥ item count, all kinds grouped).
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<OfferingKind | "all">("all");
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE_SIZE);
  // Reset the page window whenever the filter narrows/changes — adjusted during render
  // (not in an effect) so it doesn't trigger a cascading re-render.
  const filterKey = `${query} ${kindFilter}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setVisibleCount(CATALOG_PAGE_SIZE);
  }

  async function save() {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}/catalog`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerings: items }),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  // ---- feed import (paste XML/CSV → preview diff → merge/replace + persist) ----
  const [showImport, setShowImport] = useState(false);
  const [importSource, setImportSource] = useState<"feed" | "warehouse">("feed");
  const [feedText, setFeedText] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [syncProvider, setSyncProvider] = useState("demo");
  const [syncToken, setSyncToken] = useState("");
  const [erpCfg, setErpCfg] = useState({
    endpoint: "",
    format: "json" as "json" | "csv",
    itemsPath: "data.products",
    auth: "none" as "none" | "bearer" | "header",
    mapSku: "sku",
    mapName: "name",
    mapPrice: "price",
    mapStock: "stock",
  });
  const setErp = (patch: Partial<typeof erpCfg>) => setErpCfg((c) => ({ ...c, ...patch }));
  const [importStrategy, setImportStrategy] = useState<"merge" | "replace">("merge");
  const [importState, setImportState] = useState<
    "idle" | "previewing" | "preview" | "importing" | "done" | "error"
  >("idle");
  const [importInfo, setImportInfo] = useState<{
    diff?: CatalogDiff;
    format?: string;
    warnings?: string[];
    error?: string;
  } | null>(null);
  const [syncConn, setSyncConn] = useState<PublicConnection | null>(null);
  const [connBusy, setConnBusy] = useState(false);

  const hasFeedInput = feedText.trim() !== "" || feedUrl.trim() !== "";
  const selectedProvider = SYNC_PROVIDERS.find((p) => p.id === syncProvider);
  const isWarehouse = importSource === "warehouse";
  const isErp = selectedProvider?.id === "erp";
  const erpNeedsToken = isErp && erpCfg.auth !== "none";
  const hasConnectInput =
    !!selectedProvider?.implemented &&
    (isErp
      ? erpCfg.endpoint.trim() !== "" &&
        erpCfg.mapSku.trim() !== "" &&
        erpCfg.mapName.trim() !== "" &&
        (!erpNeedsToken || syncToken.trim() !== "")
      : !selectedProvider.needsToken || syncToken.trim() !== "");
  // Feed: needs pasted/URL input. Warehouse: syncs through the persisted connection.
  const hasImportInput = isWarehouse ? syncConn != null : hasFeedInput;
  const providerLabel = (pid: string) => SYNC_PROVIDERS.find((p) => p.id === pid)?.label ?? pid;

  // Load the persisted warehouse connection once (authed only).
  useEffect(() => {
    if (!persistable) return;
    let alive = true;
    fetch(`/api/projects/${projectId}/warehouse`)
      .then((r) => r.json())
      .then((j) => {
        if (alive) setSyncConn(j?.connection ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [persistable, projectId]);

  async function connect() {
    if (!hasConnectInput || connBusy) return;
    setConnBusy(true);
    try {
      const payload = isErp
        ? {
            provider: "erp",
            token: erpNeedsToken ? syncToken.trim() || undefined : undefined,
            config: {
              endpoint: erpCfg.endpoint.trim(),
              format: erpCfg.format,
              auth: erpCfg.auth,
              ...(erpCfg.format === "json" && erpCfg.itemsPath.trim()
                ? { itemsPath: erpCfg.itemsPath.trim() }
                : {}),
              mapping: {
                sku: erpCfg.mapSku.trim(),
                name: erpCfg.mapName.trim(),
                ...(erpCfg.mapPrice.trim() ? { price: erpCfg.mapPrice.trim() } : {}),
                ...(erpCfg.mapStock.trim() ? { stock: erpCfg.mapStock.trim() } : {}),
              },
            },
          }
        : { provider: syncProvider, token: syncToken.trim() || undefined };
      const res = await fetch(`/api/projects/${projectId}/warehouse`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (res.ok && j.connection) {
        setSyncConn(j.connection);
        setSyncToken("");
        setImportState("idle");
        setImportInfo(null);
      } else {
        setImportState("error");
        setImportInfo({ error: j?.error });
      }
    } catch {
      setImportState("error");
      setImportInfo({ error: undefined });
    } finally {
      setConnBusy(false);
    }
  }

  async function disconnect() {
    if (connBusy) return;
    setConnBusy(true);
    try {
      await fetch(`/api/projects/${projectId}/warehouse`, { method: "DELETE" });
      setSyncConn(null);
      setImportInfo(null);
      setImportState("idle");
    } catch {
      /* ignore */
    } finally {
      setConnBusy(false);
    }
  }

  // Both feed import (/import) and warehouse sync (/sync) funnel through the same
  // preview/apply diff handling — only the endpoint + payload differ.
  async function submitImport(path: "import" | "sync", payload: Record<string, unknown>, mode: "preview" | "apply") {
    setImportState(mode === "preview" ? "previewing" : "importing");
    try {
      const res = await fetch(`/api/projects/${projectId}/catalog/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, mode, strategy: importStrategy }),
      });
      const json = await res.json();
      if (!res.ok) {
        setImportState("error");
        setImportInfo({ error: json?.error, warnings: json?.warnings });
        return;
      }
      if (mode === "apply" && Array.isArray(json.offerings)) {
        setItemsState(json.offerings as Offering[]);
        setSaveState("saved");
      }
      setImportState(mode === "apply" ? "done" : "preview");
      setImportInfo({ diff: json.diff, format: json.format, warnings: json.warnings });
    } catch {
      setImportState("error");
      setImportInfo({ error: undefined });
    }
  }

  const runImport = (mode: "preview" | "apply") =>
    submitImport("import", { url: feedUrl.trim() || undefined, content: feedText }, mode);
  const runSync = (mode: "preview" | "apply") =>
    submitImport("sync", { provider: syncConn?.provider ?? syncProvider }, mode);
  const run = (mode: "preview" | "apply") => {
    if (!hasImportInput) return;
    return isWarehouse ? runSync(mode) : runImport(mode);
  };

  // Stable so the memoized OfferingCard doesn't re-render when a sibling commits. The
  // immutable .map keeps unchanged rows' references, so React.memo skips them.
  const localityName = useCallback((id: string) => localities.find((l) => l.id === id)?.name ?? id, [localities]);
  const onCommit = useCallback((id: string, changes: OfferingCommit) => {
    setItemsState((xs) => xs.map((o) => (o.id === id ? ({ ...o, ...changes } as Offering) : o)));
    setSaveState("idle");
  }, []);
  const onRemove = useCallback((id: string) => {
    setItemsState((xs) => xs.filter((o) => o.id !== id));
    setSaveState("idle");
  }, []);
  function add() {
    const kind = PRIMARY_KIND[projectType];
    // A collision-resistant id: the old per-mount counter reset to 0 on every mount,
    // so after add → save → return → add, the new row reused a persisted id (p:new-1),
    // and update/remove (keyed by id) then hit BOTH rows + collided React keys.
    const uid = crypto.randomUUID();
    const base = {
      id: `${projectId}:new-${uid}`,
      projectId,
      name: "",
      category: "",
      active: true,
      nature: (kind === "service" ? "local" : "online") as OfferingNature,
      price: 0,
      currency: "CZK",
      channels: [] as string[],
      tags: [] as string[],
      source: "manual" as const,
      updatedAt: "",
    };
    const fresh: Offering =
      kind === "product"
        ? { ...base, kind: "product", sku: `NEW-${uid.slice(0, 8)}`, stock: 0, dailyVelocity: 0 }
        : kind === "plan"
          ? { ...base, kind: "plan", interval: "month", competitors: [], differentiators: [] }
          : { ...base, kind: "service", priceModel: "from", serviceAreas: [] };
    setItems((xs) => [...xs, fresh]);
  }

  const natureCount = (n: OfferingNature) => items.filter((o) => o.nature === n).length;

  // Filter (kind + search) → paginate → group the visible slice by kind. Empty query +
  // "all" filter + a small catalog collapses to the original full grouped view.
  const filtered = items.filter(
    (o) => (kindFilter === "all" || o.kind === kindFilter) && offeringMatchesQuery(o, query)
  );
  const visible = filtered.slice(0, visibleCount);
  const visibleKinds: OfferingKind[] = (["product", "plan", "service"] as OfferingKind[]).filter((k) =>
    visible.some((o) => o.kind === k)
  );
  const filterKinds: OfferingKind[] = (["product", "plan", "service"] as OfferingKind[]).filter((k) =>
    items.some((o) => o.kind === k)
  );

  // If the active kind filter's option no longer exists (its last item was removed, or a
  // Replace import swapped the catalog), its button vanishes but the filter would stay
  // set — leaving a "no matches" dead-end with no visible active filter. Reset to "all"
  // during render (same render-time-adjustment pattern as the pagination window above).
  if (kindFilter !== "all" && !filterKinds.includes(kindFilter)) {
    setKindFilter("all");
  }

  return (
    <div className="stagger space-y-5">
      {/* source strip — compact badge built from the connection data (the full WMS
          connector picker lives in the Sklad module). */}
      <div className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-accent">
            <ModuleIcon icon="store" width={16} height={16} />
          </span>
          <div className="text-sm">
            <div className="font-semibold text-navy-800">{projectName}</div>
            <div className="text-xs text-muted">
              {connection
                ? `${t("liveFrom")} ${connection.provider.label} · ${connection.syncedMinsAgo} min`
                : t("manualCatalog")}
            </div>
          </div>
        </div>
        <Pill tone={connection ? "positive" : "neutral"}>
          {items.length} {t("offerings")}
        </Pill>
      </div>

      {/* nature summary */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["online", "local", "hybrid"] as OfferingNature[]).map((n) =>
          natureCount(n) > 0 ? (
            <Pill key={n} tone={n === "local" ? "brand" : n === "hybrid" ? "navy" : "neutral"}>
              {t(n)} · {natureCount(n)}
            </Pill>
          ) : null
        )}
      </div>

      {items.length === 0 && (
        <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          {t("empty")}
        </p>
      )}

      {/* search + kind filter — grounds the manager for a real shop */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[14rem] flex-1">
            <Search
              width={15}
              height={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPh")}
              aria-label={t("searchPh")}
              className={`${inputBase} w-full pl-8`}
            />
          </label>
          <div className="inline-flex rounded-pill border border-line p-0.5 text-xs">
            {(["all", ...filterKinds] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                aria-pressed={kindFilter === k}
                className={`rounded-pill px-3 py-1 font-medium transition-colors ${
                  kindFilter === k ? "bg-brand-700 text-white" : "text-muted hover:text-navy-700"
                }`}
              >
                {k === "all" ? t("filterAll") : t(KIND_META[k].titleKey)}
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && filtered.length === 0 && (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {t("noMatches")}
        </p>
      )}

      {/* offerings grouped by kind (over the visible, paginated slice) */}
      {visibleKinds.map((kind) => {
        const meta = KIND_META[kind];
        const rows = visible.filter((o) => o.kind === kind);
        return (
          <section key={kind} className="space-y-2">
            <div className="flex items-center gap-2">
              <ModuleIcon icon={meta.icon} width={15} height={15} className="text-brand-accent" />
              <h3 className="text-sm font-semibold text-navy-800">{t(meta.titleKey)}</h3>
              <span className="text-xs text-muted">· {rows.length}</span>
            </div>
            <div className="space-y-2">
              {rows.map((o) => (
                <OfferingCard
                  key={o.id}
                  o={o}
                  t={t}
                  onCommit={onCommit}
                  onRemove={onRemove}
                  localityName={localityName}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* pagination: show N + load more */}
      {filtered.length > visible.length && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + CATALOG_PAGE_SIZE)}
            className="rounded-pill border border-line px-3.5 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
          >
            {t("loadMore")}
          </button>
          <span className="text-xs text-muted">{t("showing", { shown: visible.length, total: filtered.length })}</span>
        </div>
      )}

      {/* actions */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3.5 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
        >
          <Plus width={15} height={15} />
          {t("add")}
        </button>
        <button
          type="button"
          disabled={!persistable || saveState === "saving"}
          onClick={persistable ? save : undefined}
          title={persistable ? undefined : t("sessionNote")}
          className={`rounded-pill bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800 ${
            !persistable ? "opacity-50" : saveState === "saving" ? "opacity-70" : ""
          }`}
        >
          {saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : t("save")}
        </button>
        {saveState === "saved" && <span className="text-xs font-medium text-positive">✓ {t("saved")}</span>}
        {saveState === "error" && <span className="text-xs font-medium text-negative">{t("saveError")}</span>}
      </div>

      {/* feed import — authed only (needs the ownership-checked API) */}
      {persistable && (
        <div className="rounded-card border border-line bg-surface">
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            aria-expanded={showImport}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-navy-800"
          >
            <span className="inline-flex items-center gap-2">
              <ModuleIcon icon="store" width={15} height={15} className="text-brand-accent" />
              {t("importHeading")}
            </span>
            <span className="text-lg leading-none text-muted">{showImport ? "–" : "+"}</span>
          </button>
          {showImport && (
            <div className="space-y-3 border-t border-line px-4 py-3">
              {/* source tabs: paste/URL a feed, or sync a warehouse/ERP */}
              <div className="inline-flex rounded-pill border border-line p-0.5 text-xs">
                {(["feed", "warehouse"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setImportSource(s)}
                    aria-pressed={importSource === s}
                    className={`rounded-pill px-3 py-1 font-medium transition-colors ${
                      importSource === s ? "bg-brand-700 text-white" : "text-muted hover:text-navy-700"
                    }`}
                  >
                    {t(s === "feed" ? "tabFeed" : "tabWarehouse")}
                  </button>
                ))}
              </div>

              {importSource === "feed" ? (
                <>
                  <p className="text-xs text-muted">{t("importHint")}</p>
                  <label className="block">
                    <span className="text-xs font-medium text-navy-700">{t("urlLabel")}</span>
                    <input
                      type="url"
                      value={feedUrl}
                      onChange={(e) => setFeedUrl(e.target.value)}
                      placeholder={t("urlPlaceholder")}
                      className={`${inputBase} mt-1 w-full`}
                    />
                  </label>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
                    <span className="h-px flex-1 bg-line" />
                    {t("orPaste")}
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <textarea
                    value={feedText}
                    onChange={(e) => setFeedText(e.target.value)}
                    placeholder={t("feedPlaceholder")}
                    rows={5}
                    spellCheck={false}
                    className={`${inputBase} w-full resize-y font-mono text-xs`}
                  />
                </>
              ) : syncConn ? (
                <div
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${
                    syncConn.lastError ? "bg-coral-soft" : "bg-positive-soft/50"
                  }`}
                >
                  <span className="text-navy-700">
                    <span className={`font-semibold ${syncConn.lastError ? "text-coral-600" : "text-positive"}`}>
                      ●
                    </span>{" "}
                    {t("connectedTo")} <span className="font-medium">{providerLabel(syncConn.provider)}</span>
                    {" · "}
                    {syncConn.lastSyncAt
                      ? `${t("lastSync")} ${syncConn.lastSyncAt.slice(0, 16).replace("T", " ")}`
                      : t("neverSynced")}
                    {syncConn.lastError && (
                      <span className="mt-0.5 block font-medium text-coral-600">
                        {t("syncFailedLabel")}: {syncConn.lastError}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={connBusy}
                    className="shrink-0 rounded-pill border border-line px-2.5 py-1 font-medium text-muted transition-colors hover:border-coral-300 hover:text-coral-600 disabled:opacity-50"
                  >
                    {t("disconnect")}
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted">{t("syncHint")}</p>
                  <label className="block">
                    <span className="text-xs font-medium text-navy-700">{t("provider")}</span>
                    <select
                      value={syncProvider}
                      onChange={(e) => setSyncProvider(e.target.value)}
                      className={`${inputBase} mt-1 w-full cursor-pointer`}
                    >
                      {SYNC_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                          {p.implemented ? "" : ` · ${t("comingSoon")}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  {isErp ? (
                    <div className="grid gap-2">
                      <p className="text-[11px] text-muted">{t("erpHint")}</p>
                      <label className="block">
                        <span className="text-xs font-medium text-navy-700">{t("erpEndpoint")}</span>
                        <input
                          value={erpCfg.endpoint}
                          onChange={(e) => setErp({ endpoint: e.target.value })}
                          placeholder="https://erp.example.cz/api/products"
                          autoComplete="off"
                          className={`${inputBase} mt-1 w-full font-mono text-xs`}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-xs font-medium text-navy-700">{t("erpFormat")}</span>
                          <select
                            value={erpCfg.format}
                            onChange={(e) => setErp({ format: e.target.value as "json" | "csv" })}
                            className={`${inputBase} mt-1 w-full cursor-pointer`}
                          >
                            <option value="json">JSON</option>
                            <option value="csv">CSV</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-navy-700">{t("erpAuth")}</span>
                          <select
                            value={erpCfg.auth}
                            onChange={(e) => setErp({ auth: e.target.value as "none" | "bearer" | "header" })}
                            className={`${inputBase} mt-1 w-full cursor-pointer`}
                          >
                            <option value="none">{t("erpAuthNone")}</option>
                            <option value="bearer">Bearer token</option>
                            <option value="header">{t("erpAuthHeader")}</option>
                          </select>
                        </label>
                      </div>
                      {erpCfg.format === "json" && (
                        <label className="block">
                          <span className="text-xs font-medium text-navy-700">{t("erpItemsPath")}</span>
                          <input
                            value={erpCfg.itemsPath}
                            onChange={(e) => setErp({ itemsPath: e.target.value })}
                            placeholder="data.products"
                            autoComplete="off"
                            className={`${inputBase} mt-1 w-full font-mono text-xs`}
                          />
                        </label>
                      )}
                      <div>
                        <span className="text-xs font-medium text-navy-700">{t("erpMapping")}</span>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          {(
                            [
                              ["mapSku", "SKU", true],
                              ["mapName", t("namePh"), true],
                              ["mapPrice", t("price"), false],
                              ["mapStock", t("stock"), false],
                            ] as const
                          ).map(([k, label, req]) => (
                            <label key={k} className="block">
                              <span className="text-[11px] text-muted">
                                {label}
                                {req ? " *" : ""}
                              </span>
                              <input
                                value={erpCfg[k]}
                                onChange={(e) => setErp({ [k]: e.target.value } as Partial<typeof erpCfg>)}
                                autoComplete="off"
                                className={`${inputBase} mt-0.5 w-full font-mono text-xs`}
                              />
                            </label>
                          ))}
                        </div>
                        <p className="mt-1 text-[11px] text-muted">{t("erpMappingHint")}</p>
                      </div>
                      {erpNeedsToken && (
                        <label className="block">
                          <span className="text-xs font-medium text-navy-700">{t("token")}</span>
                          <input
                            type="password"
                            value={syncToken}
                            onChange={(e) => setSyncToken(e.target.value)}
                            placeholder={t("tokenPlaceholder")}
                            autoComplete="off"
                            className={`${inputBase} mt-1 w-full`}
                          />
                        </label>
                      )}
                    </div>
                  ) : selectedProvider?.needsToken ? (
                    <label className="block">
                      <span className="text-xs font-medium text-navy-700">{t("token")}</span>
                      <input
                        type="password"
                        value={syncToken}
                        onChange={(e) => setSyncToken(e.target.value)}
                        placeholder={t("tokenPlaceholder")}
                        autoComplete="off"
                        className={`${inputBase} mt-1 w-full`}
                      />
                    </label>
                  ) : (
                    <p className="text-[11px] text-muted">{t("demoNote")}</p>
                  )}
                  <button
                    type="button"
                    onClick={connect}
                    disabled={!hasConnectInput || connBusy}
                    className="rounded-pill bg-brand-700 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
                  >
                    {connBusy ? t("connecting") : t("connect")}
                  </button>
                </>
              )}

              {(importSource === "feed" || syncConn) && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-pill border border-line p-0.5 text-xs">
                  {(["merge", "replace"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setImportStrategy(s)}
                      aria-pressed={importStrategy === s}
                      title={t(s === "merge" ? "strategyMergeHint" : "strategyReplaceHint")}
                      className={`rounded-pill px-3 py-1 font-medium transition-colors ${
                        importStrategy === s ? "bg-brand-700 text-white" : "text-muted hover:text-navy-700"
                      }`}
                    >
                      {t(s === "merge" ? "strategyMerge" : "strategyReplace")}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => run("preview")}
                  disabled={!hasImportInput || importState === "previewing"}
                  className="rounded-pill border border-line px-3.5 py-1.5 text-sm font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
                >
                  {importState === "previewing" ? t("previewing") : t("preview")}
                </button>
                <button
                  type="button"
                  onClick={() => run("apply")}
                  disabled={!hasImportInput || importState === "importing"}
                  className="rounded-pill bg-brand-700 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
                >
                  {importState === "importing"
                    ? isWarehouse
                      ? t("syncing")
                      : t("importing")
                    : isWarehouse
                      ? t("sync")
                      : t("runImport")}
                </button>
              </div>
              )}

              {importInfo?.error !== undefined && importState === "error" && (
                <p className="text-xs font-medium text-negative">
                  {t("importFailed")}
                  {importInfo.error ? `: ${importInfo.error}` : ""}
                </p>
              )}
              {importInfo?.diff && (
                <div className="rounded-lg bg-brand-50/60 px-3 py-2 text-xs text-navy-700">
                  {importState === "done" && (
                    <span className="font-semibold text-positive">✓ {t("imported")} · </span>
                  )}
                  {importInfo.format && (
                    <span className="uppercase tracking-wide text-muted">{importInfo.format}</span>
                  )}
                  <span className="tnum ml-1">
                    {importInfo.diff.added} {t("diffAdded")} · {importInfo.diff.updated} {t("diffUpdated")} ·{" "}
                    {importInfo.diff.unchanged} {t("diffUnchanged")}
                    {importInfo.diff.removed > 0 && (
                      <>
                        {" · "}
                        {importInfo.diff.removed} {t("diffRemoved")}
                      </>
                    )}
                  </span>
                </div>
              )}
              {importInfo?.warnings && importInfo.warnings.length > 0 && (
                <ul className="space-y-0.5 text-[11px] text-coral-600">
                  {importInfo.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {!persistable && (
        <p className="rounded-lg bg-brand-50/60 px-3.5 py-2.5 text-xs text-navy-700">{t("sessionNote")}</p>
      )}
    </div>
  );
}
