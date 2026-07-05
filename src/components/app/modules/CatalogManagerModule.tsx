"use client";

/** Katalog — the project's business catalog manager. A type-aware editor over the
 *  offering entity: products (e-shop), plans + competitors (app/SaaS) or services ×
 *  localities (lead-gen), plus each offering's pricing, margin and online/local
 *  nature. This is the source the smart modules (Sklad, Srovnání & SEO, Lokální,
 *  Zisk) read from. Edits persist per project (Save), and a product feed (Heureka /
 *  Zboží.cz / Google / CSV) can be imported; live WMS API sync is the remaining
 *  follow-up. Demo (`persistable=false`) stays session-only. */
import { useRef, useState } from "react";
import { Pill } from "@/components/ui";
import { Plus } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import { useT } from "@/lib/i18n/client";
import type { Locality, Offering, OfferingKind, OfferingNature } from "@/lib/catalog/offering";
import { isPlan, isProduct, isService } from "@/lib/catalog/offering";
import type { CatalogDiff } from "@/lib/catalog/import";
import { SYNC_PROVIDERS } from "@/lib/inventory/providers";
import type { WarehouseConnection } from "@/lib/inventory/warehouse";
import type { ProjectType } from "@/lib/projects/types";
import type { IconKey } from "@/lib/projects/icon-keys";

const T = {
  cs: {
    sessionNote: "Úpravy jsou zatím jen v této relaci — perzistence a živé napojení WMS přijdou v další fázi.",
    manualCatalog: "Manuální katalog",
    liveFrom: "Živě z",
    offerings: "položek",
    add: "Přidat",
    save: "Uložit změny",
    saving: "Ukládám…",
    saved: "Uloženo",
    saveError: "Uložení selhalo",
    namePh: "Název",
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
    areas: "Lokality",
    capacity: "kapacita",
    week: "týd.",
    empty: "Zatím žádné položky. Přidejte první, nebo připojte zdroj.",
    remove: "Odebrat",
    importHeading: "Import feedu",
    importHint:
      "Zadejte URL feedu, nebo vložte XML/CSV (Heureka, Zboží.cz, Google Nákupy). Živá synchronizace WMS přijde příště.",
    feedPlaceholder: "Sem vložte obsah feedu — XML nebo CSV…",
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
    demoNote: "Ukázková data skladu — bez přihlašovacích údajů.",
    sync: "Synchronizovat",
    syncing: "Synchronizuji…",
  },
  en: {
    sessionNote: "Edits are session-only for now — persistence and live WMS sync land in the next phase.",
    manualCatalog: "Manual catalog",
    liveFrom: "Live from",
    offerings: "items",
    add: "Add",
    save: "Save changes",
    saving: "Saving…",
    saved: "Saved",
    saveError: "Save failed",
    namePh: "Name",
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
      "Enter a feed URL, or paste XML/CSV (Heureka, Zboží.cz, Google Shopping). Live WMS sync lands next.",
    feedPlaceholder: "Paste the feed content here — XML or CSV…",
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
    demoNote: "Sample warehouse data — no credentials.",
    sync: "Sync",
    syncing: "Syncing…",
  },
} as const;

const KIND_META: Record<OfferingKind, { titleKey: "products" | "plans" | "services"; icon: IconKey }> = {
  product: { titleKey: "products", icon: "catalog" },
  plan: { titleKey: "plans", icon: "app" },
  service: { titleKey: "services", icon: "local" },
};

const inputBase =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-navy-800 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";

const PRIMARY_KIND: Record<ProjectType, OfferingKind> = {
  eshop: "product",
  app: "plan",
  leadgen: "service",
  content: "service",
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
  const t = useT(T);
  const [items, setItemsState] = useState<Offering[]>(offerings);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Any edit drops us back to "idle" so a stale "Saved" never lingers.
  const setItems = (u: Offering[] | ((prev: Offering[]) => Offering[])) => {
    setItemsState(u);
    setSaveState("idle");
  };
  const nextId = useRef(0);

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

  const hasFeedInput = feedText.trim() !== "" || feedUrl.trim() !== "";
  const selectedProvider = SYNC_PROVIDERS.find((p) => p.id === syncProvider);
  const isWarehouse = importSource === "warehouse";
  const hasSyncInput =
    !!selectedProvider?.implemented && (!selectedProvider.needsToken || syncToken.trim() !== "");
  const hasImportInput = isWarehouse ? hasSyncInput : hasFeedInput;

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
    submitImport("sync", { provider: syncProvider, token: syncToken.trim() || undefined }, mode);
  const run = (mode: "preview" | "apply") => {
    if (!hasImportInput) return;
    return isWarehouse ? runSync(mode) : runImport(mode);
  };

  const localityName = (id: string) => localities.find((l) => l.id === id)?.name ?? id;

  function update(id: string, changes: Partial<Offering> & { stock?: number }) {
    setItems((xs) => xs.map((o) => (o.id === id ? ({ ...o, ...changes } as Offering) : o)));
  }
  function remove(id: string) {
    setItems((xs) => xs.filter((o) => o.id !== id));
  }
  function add() {
    const kind = PRIMARY_KIND[projectType];
    const n = ++nextId.current;
    const base = {
      id: `${projectId}:new-${n}`,
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
        ? { ...base, kind: "product", sku: `NEW-${n}`, stock: 0, dailyVelocity: 0 }
        : kind === "plan"
          ? { ...base, kind: "plan", interval: "month", competitors: [], differentiators: [] }
          : { ...base, kind: "service", priceModel: "from", serviceAreas: [] };
    setItems((xs) => [...xs, fresh]);
  }

  const natureCount = (n: OfferingNature) => items.filter((o) => o.nature === n).length;
  const kinds: OfferingKind[] = (["product", "plan", "service"] as OfferingKind[]).filter((k) =>
    items.some((o) => o.kind === k)
  );

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

      {/* offerings grouped by kind */}
      {kinds.map((kind) => {
        const meta = KIND_META[kind];
        const rows = items.filter((o) => o.kind === kind);
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
                  onChange={(c) => update(o.id, c)}
                  onRemove={() => remove(o.id)}
                  localityName={localityName}
                />
              ))}
            </div>
          </section>
        );
      })}

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
          className={`rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 ${
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
                      importSource === s ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
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
                          {p.implemented ? "" : ` — ${t("comingSoon")}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedProvider?.needsToken ? (
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
                </>
              )}

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
                        importStrategy === s ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
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
                  className="rounded-pill bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
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

type TFn = (k: keyof (typeof T)["cs"]) => string;

function OfferingCard({
  o,
  t,
  onChange,
  onRemove,
  localityName,
}: {
  o: Offering;
  t: TFn;
  onChange: (c: Partial<Offering> & { stock?: number }) => void;
  onRemove: () => void;
  localityName: (id: string) => string;
}) {
  const intervalLabel = isPlan(o) ? t(o.interval === "year" ? "year" : o.interval === "one-off" ? "oneOff" : "month") : "";
  const priceModelLabel = isService(o) ? t(o.priceModel === "fixed" ? "fixed" : o.priceModel === "quote" ? "quote" : "from") : "";

  return (
    <div className={`rounded-card border border-line bg-surface px-4 py-3 ${o.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          value={o.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t("namePh")}
          className={`${inputBase} min-w-[10rem] flex-1 font-medium`}
        />
        <label className="inline-flex items-center gap-1 text-sm text-muted">
          <input
            type="number"
            value={o.price}
            onChange={(e) => onChange({ price: Number(e.target.value) })}
            className={`${inputBase} w-24 text-right tnum`}
          />
          Kč
        </label>
        <label className="inline-flex items-center gap-1 text-sm text-muted" title={t("margin")}>
          <input
            type="number"
            value={o.margin != null ? Math.round(o.margin * 100) : ""}
            onChange={(e) => onChange({ margin: e.target.value === "" ? undefined : Number(e.target.value) / 100 })}
            className={`${inputBase} w-16 text-right tnum`}
          />
          %
        </label>
        <select
          value={o.nature}
          onChange={(e) => onChange({ nature: e.target.value as OfferingNature })}
          className={`${inputBase} cursor-pointer`}
          aria-label={t("namePh")}
        >
          <option value="online">{t("online")}</option>
          <option value="local">{t("local")}</option>
          <option value="hybrid">{t("hybrid")}</option>
        </select>
        <button
          type="button"
          onClick={() => onChange({ active: !o.active })}
          aria-pressed={o.active}
          className={`rounded-pill px-2.5 py-1 text-xs font-semibold transition-colors ${
            o.active ? "bg-positive-soft text-positive" : "bg-navy-50 text-muted"
          }`}
        >
          {t("active")}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("remove")}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-coral-soft hover:text-coral-600"
        >
          ×
        </button>
      </div>

      {/* kind-specific detail line */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {o.category && <span className="font-medium text-navy-700">{o.category}</span>}
        {isProduct(o) && (
          <>
            <span className="tnum">{o.sku}</span>
            <label className="inline-flex items-center gap-1">
              {t("stock")}:
              <input
                type="number"
                value={o.stock}
                onChange={(e) => onChange({ stock: Number(e.target.value) })}
                className={`${inputBase} w-16 px-2 py-0.5 text-right tnum`}
              />
              ks
            </label>
            <span className="tnum">
              {o.dailyVelocity}
              {t("perDay")}
            </span>
          </>
        )}
        {isPlan(o) && (
          <>
            <span>{intervalLabel}</span>
            {o.competitors.length > 0 && (
              <span className="flex flex-wrap items-center gap-1">
                {t("rivals")}:
                {o.competitors.map((c) => (
                  <span key={c.name} className="rounded bg-navy-50 px-1.5 py-0.5 text-[11px] font-medium text-navy-700">
                    {c.name}
                  </span>
                ))}
              </span>
            )}
          </>
        )}
        {isService(o) && (
          <>
            <span>{priceModelLabel}</span>
            {o.serviceAreas.length > 0 && (
              <span className="flex flex-wrap items-center gap-1">
                {t("areas")}:
                {o.serviceAreas.map((a) => (
                  <span key={a} className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-accent">
                    {localityName(a)}
                  </span>
                ))}
              </span>
            )}
            {o.capacityPerWeek != null && (
              <span className="tnum">
                {o.capacityPerWeek}/{t("week")} {t("capacity")}
              </span>
            )}
          </>
        )}
        {o.channels.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            {o.channels.map((c) => (
              <span key={c} className="rounded-pill bg-canvas px-1.5 py-0.5 text-[11px] text-muted">
                {c}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
