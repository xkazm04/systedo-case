"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pill } from "@/components/ui";
import { Bolt, Check, Copy, Download, Info, Refresh, Search, Sparkles } from "@/components/icons";
import type { Product } from "@/lib/catalog/sample";
import { CATALOG_PAGE_SIZE, normalizeText } from "./catalog/offering-edit";
import {
  buildAssetGroup,
  type Asset,
  type AssetGroup,
  RSA_HEADLINE_MAX,
  RSA_DESCRIPTION_MAX,
  PMAX_LONG_HEADLINE_MAX,
} from "@/lib/catalog/generate";
import {
  assetGroupCsv,
  assetGroupPlainText,
  catalogAdCopyCsv,
  type AssetGroupExportMeta,
} from "@/lib/catalog/export";
import {
  adResultToGroup,
  toAsset,
  exportMetaFor,
  adCopyForSku,
  upsertAdCopy,
  toggleSelected,
  selectionSummary,
  composeCatalogAdCopy,
  adRequestForProduct,
  type AdCopyState,
  type StoredAdCopy,
} from "@/lib/catalog/ad-copy";
import { downloadText } from "@/lib/export";
import { useAiTool } from "@/components/ai/useAiTool";
import { useOptionalProject } from "@/lib/projects/context";
import { AD_LIMITS, type AdResult } from "@/lib/ai-types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAdCopyBatch, type BatchItemState } from "./catalog/useAdCopyBatch";
import { loadAdCopyAction, saveAdCopyAction } from "./catalog/ad-copy-actions";

const T = {
  cs: {
    productFeedLabel: "Produktový feed · {n}",
    searchProducts: "Hledat produkt…",
    loadMore: "Zobrazit další",
    showing: "Zobrazeno {shown} z {total}",
    noMatches: "Žádné produkty neodpovídají hledání.",
    lowStock: "{n} ks",
    assetGroupSuffix: "Asset group · {sku} ·",
    aiTexts: "AI texty",
    pmaxRsa: "PMax / RSA",
    generating: "Generuji…",
    regenerate: "Generovat znovu",
    generateAi: "Generovat AI texty",
    copyAll: "Kopírovat vše",
    copyAllAriaLabel: "Kopírovat vše",
    exportCsv: "Exportovat CSV",
    exportCsvAriaLabel: "Exportovat CSV",
    copied: "Zkopírováno",
    generatingStatus: "Generuji on-brand texty modelem… mezitím vidíte sestavený návrh z feedu.",
    timedOut: "Model neodpověděl včas. Zobrazujeme sestavený návrh z feedu.",
    generationFailed: "Generování selhalo",
    generationFailedSuffix: "Zobrazujeme návrh z feedu.",
    retryBtn: "Zkusit znovu",
    demoMode: "Ukázkový režim (bez API klíče). Připojte LLM pro generování modelem.",
    headlinesTitle: "Headliny ({n})",
    longHeadlinesTitle: "Dlouhé headliny ({n})",
    descriptionsTitle: "Popisky ({n})",
    calloutsTitle: "Odznaky ({n})",
    keywordsTitle: "Klíčová slova ({n})",
    rationaleTitle: "Proč právě takhle",
    footerAi: "On-brand texty vygenerované AI (mode „ads“ přes /api/ai), s kontrolou limitů Google Ads (headline {hl}, popisek {desc}, dlouhý headline {lhl} znaků).",
    footerDet: "Sestaveno z feedu podle limitů Google Ads (headline {hl}, popisek {desc} znaků). Vyberte „Generovat AI texty“ pro on-brand verzi přes /api/ai.",
    // Direction 1 — ad copy at catalog scale
    selectForBatch: "Vybrat {title} pro hromadné generování",
    selectAll: "Vybrat zobrazené",
    clearSelection: "Zrušit výběr",
    generateSelected: "Generovat pro vybrané ({n})",
    batchCost: "Spotřebuje {n} generací z denní kvóty.",
    batchOverwrite: "{m} z nich přepíše uložené texty.",
    batchRunning: "Generuji {done}/{total}… ({failed} chyb)",
    batchDone: "Hotovo {done}/{total} · {failed} chyb",
    batchStop: "Zastavit",
    batchRetryAll: "Zkusit znovu chyby ({n})",
    storedAge: "Uloženo {ago} · {model}",
    savedBadge: "Uloženo",
    exportAll: "Exportovat vše ({n})",
    exportAllAria: "Exportovat všechny asset groups do CSV",
    exportAllHint: "{ai} s AI texty, {floor} z feedu",
    rowRetry: "Zkusit znovu",
  },
  en: {
    productFeedLabel: "Product feed · {n}",
    searchProducts: "Search products…",
    loadMore: "Show more",
    showing: "Showing {shown} of {total}",
    noMatches: "No products match your search.",
    lowStock: "{n} units",
    assetGroupSuffix: "Asset group · {sku} ·",
    aiTexts: "AI copy",
    pmaxRsa: "PMax / RSA",
    generating: "Generating…",
    regenerate: "Regenerate",
    generateAi: "Generate AI copy",
    copyAll: "Copy all",
    copyAllAriaLabel: "Copy all",
    exportCsv: "Export CSV",
    exportCsvAriaLabel: "Export CSV",
    copied: "Copied",
    generatingStatus: "Generating on-brand copy with the model… showing the feed-assembled draft in the meantime.",
    timedOut: "The model timed out. Showing the feed-assembled draft.",
    generationFailed: "Generation failed",
    generationFailedSuffix: "Showing the feed draft.",
    retryBtn: "Retry",
    demoMode: "Demo mode (no API key). Connect an LLM to generate with the model.",
    headlinesTitle: "Headlines ({n})",
    longHeadlinesTitle: "Long headlines ({n})",
    descriptionsTitle: "Descriptions ({n})",
    calloutsTitle: "Callouts ({n})",
    keywordsTitle: "Keywords ({n})",
    rationaleTitle: "Why this approach",
    footerAi: "AI-generated on-brand copy (“ads” mode via /api/ai), validated against Google Ads limits (headline {hl}, description {desc}, long headline {lhl} chars).",
    footerDet: "Assembled from the feed per Google Ads limits (headline {hl}, description {desc} chars). Select “Generate AI copy” for an on-brand version via /api/ai.",
    // Direction 1 — ad copy at catalog scale
    selectForBatch: "Select {title} for batch generation",
    selectAll: "Select shown",
    clearSelection: "Clear",
    generateSelected: "Generate for selected ({n})",
    batchCost: "Uses {n} generations from your daily quota.",
    batchOverwrite: "{m} of them overwrite saved copy.",
    batchRunning: "Generating {done}/{total}… ({failed} failed)",
    batchDone: "Done {done}/{total} · {failed} failed",
    batchStop: "Stop",
    batchRetryAll: "Retry failed ({n})",
    storedAge: "Saved {ago} · {model}",
    savedBadge: "Saved",
    exportAll: "Export all ({n})",
    exportAllAria: "Export every asset group to CSV",
    exportAllHint: "{ai} with AI copy, {floor} from the feed",
    rowRetry: "Retry",
  },
} as const;

function AssetChip({ a }: { a: Asset }) {
  const over = a.len > a.max;
  return (
    <span className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-2 text-sm">
      <span className="text-navy-800">{a.text}</span>
      <span className={`tnum shrink-0 text-xs ${over ? "text-negative" : "text-muted"}`}>
        {a.len}/{a.max}
      </span>
    </span>
  );
}

function AssetSection({ title, assets }: { title: string; assets: Asset[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-2 space-y-1.5">
        {assets.map((a, i) => (
          <AssetChip key={i} a={a} />
        ))}
      </div>
    </div>
  );
}

/** Header actions to get the assembled asset group out of the screen: copy every
 *  asset as plain text, or download a Google Ads Editor RSA CSV. Module-scope (not
 *  defined during render) — the translator is passed in. */
function ExportActions({
  group: g,
  meta,
  t,
}: {
  group: AssetGroup;
  meta: AssetGroupExportMeta;
  t: (key: keyof typeof T.cs) => string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(assetGroupPlainText(g, meta));
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      /* clipboard unavailable */
    }
  }

  function exportCsv() {
    downloadText(`asset-group-${g.sku.toLowerCase()}.csv`, assetGroupCsv(g, meta));
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:bg-brand-50";

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={copyAll} className={btn} aria-label={t("copyAllAriaLabel")}>
        {copied ? <Check width={14} height={14} className="text-positive" /> : <Copy width={14} height={14} />}
        {copied ? t("copied") : t("copyAll")}
      </button>
      <button type="button" onClick={exportCsv} className={btn} aria-label={t("exportCsvAriaLabel")}>
        <Download width={14} height={14} />
        {t("exportCsv")}
      </button>
    </div>
  );
}

/** Small per-row batch status glyph shown on the product feed while / after a batch:
 *  running (pulse), done (check), failed (warning + retry). Pending renders nothing. */
function RowStatus({
  state,
  onRetry,
  retryLabel,
}: {
  state: BatchItemState | undefined;
  onRetry: () => void;
  retryLabel: string;
}) {
  if (state === "running") return <Sparkles width={14} height={14} className="shrink-0 animate-pulse text-brand-accent" />;
  if (state === "done") return <Check width={14} height={14} className="shrink-0 text-positive" />;
  if (state === "failed")
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
        className="shrink-0 rounded-pill border border-negative/30 bg-negative-soft px-1.5 py-0.5 text-[10px] font-medium text-negative hover:border-negative/50"
      >
        {retryLabel}
      </button>
    );
  return null;
}

export default function CatalogModule({
  products,
  brand = "",
  domain = "",
}: {
  products: Product[];
  /** clean project name + domain, so the demo copy / final URL aren't hardcoded to
   *  one shop (BM-L1-02) */
  brand?: string;
  domain?: string;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();
  // The active project (null on the demo surface). Gates persistence: the demo has no
  // project → the server actions no-op and nothing is stored (ephemeral, as before).
  const projectId = useOptionalProject()?.id;

  const [sku, setSku] = useState(products[0]?.sku ?? "");
  const product = products.find((p) => p.sku === sku) ?? products[0];

  // Search + "show N + load more" so the feed sidebar scales to a real shop. Below
  // CATALOG_PAGE_SIZE with an empty query the full list renders exactly as before; the
  // search box appears only once the list is non-trivial (> 8 items).
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE_SIZE);
  // Reset pagination when the query changes — adjusted during render (not in an effect).
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setVisibleCount(CATALOG_PAGE_SIZE);
  }
  const matched = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return products;
    return products.filter((p) =>
      [p.title, p.sku, p.category, ...p.usps].some((h) => normalizeText(h).includes(q))
    );
  }, [products, query]);
  const visibleProducts = matched.slice(0, visibleCount);
  const showSearch = products.length > 8;

  // Deterministic, offline-always asset group — the floor that renders on a clean
  // checkout and serves as the loading / error / not-yet-generated fallback.
  const deterministic = useMemo(() => (product ? buildAssetGroup(product, brand, domain) : null), [product, brand, domain]);

  // AI ad-copy generator (existing `ads` tool, via /api/ai). Additive: we only
  // swap the deterministic group for the model output once it arrives.
  const { status, data, error, timedOut, run, reset } = useAiTool<AdResult>("ads");
  // The SKU the current AI result belongs to. The hook persists results by mode
  // only, so we pin them to a SKU and ignore output meant for another product.
  const [aiSku, setAiSku] = useState<string | null>(null);

  // ── Direction 1: persisted per-SKU copy (survives reload) + multi-select batch ──
  const [persisted, setPersisted] = useState<AdCopyState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const batch = useAdCopyBatch();
  const mergeEntry = (e: StoredAdCopy) => setPersisted((prev) => upsertAdCopy(prev, e));

  // Hydrate persisted copy on mount / project change, so a reload shows saved copy.
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    loadAdCopyAction(projectId)
      .then((s) => {
        if (alive) setPersisted(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Persist a fresh SINGLE (interactive) generation once it lands, so the single path
  // saves exactly like the batch. Keyed on the result object identity so a restored-
  // from-storage result (aiSku null) or a re-render never re-saves the same generation.
  const persistedDataRef = useRef<unknown>(null);
  useEffect(() => {
    if (status !== "done" || !aiSku || aiSku !== sku) return;
    const result = data?.result;
    if (!result || persistedDataRef.current === data) return;
    persistedDataRef.current = data;
    const entry: StoredAdCopy = {
      sku: aiSku,
      result,
      generatedAt: new Date().toISOString(),
      model: data.meta.provider || data.meta.model || "demo",
      demo: data.meta.demo === true,
    };
    setPersisted((prev) => upsertAdCopy(prev, entry));
    if (projectId) void saveAdCopyAction(projectId, aiSku, entry).catch(() => {});
  }, [status, data, aiSku, sku, projectId]);

  // Switching products discards a previous SKU's LIVE AI output so the user never sees
  // copy generated for a different item; the persisted copy (or deterministic group)
  // renders instead.
  useEffect(() => {
    if (aiSku && aiSku !== sku) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku]);

  function generate() {
    if (!product || status === "loading") return;
    setAiSku(product.sku);
    run({ ...adRequestForProduct(product) });
  }

  // ── the batch: generate for every selected SKU, sequentially, no quota bypass ──
  const batchProducts = useMemo(() => products.filter((p) => selected.includes(p.sku)), [products, selected]);
  const summary = selectionSummary(selected, persisted);
  const failedSkus = Object.entries(batch.progress.status)
    .filter(([, s]) => s === "failed")
    .map(([k]) => k);
  const doneCount = Object.values(batch.progress.status).filter((s) => s === "done").length;

  function runBatch() {
    if (batchProducts.length === 0 || batch.progress.running) return;
    void batch.runBatch(batchProducts, projectId, mergeEntry);
  }
  function retryFailed() {
    for (const s of failedSkus) {
      const p = products.find((x) => x.sku === s);
      if (p) void batch.retryItem(p, projectId, mergeEntry);
    }
  }

  // ── view resolution: live gen (this SKU) → persisted → deterministic floor ──
  const stored = adCopyForSku(persisted, sku);
  const liveResult = status === "done" && aiSku === sku ? data?.result ?? null : null;
  const aiResult = liveResult ?? stored?.result ?? null;
  const group = aiResult && product ? adResultToGroup(aiResult, product, domain) : deterministic;
  const usingAi = Boolean(aiResult);
  // Age label + demo flag come from the persisted entry only when we're SHOWING it (no
  // fresher live gen for this SKU); a fresh live gen is implicitly "just now".
  const showingStored = !liveResult && Boolean(stored);
  const showDemo = liveResult ? data?.meta.demo : stored?.demo;

  if (!product || !group) return null;

  // Names mirror how the asset group lands in Google Ads Editor (campaign per
  // category, asset group per product) so the export drops straight in.
  const exportMeta = exportMetaFor(product);

  function exportAll() {
    const rows = composeCatalogAdCopy(products, persisted, brand, domain);
    downloadText("asset-groups.csv", catalogAdCopyCsv(rows, locale === "en" ? "en" : "cs"));
  }
  const aiCount = persisted?.items.length ?? 0;

  return (
    <div className="stagger grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* product feed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("productFeedLabel", { n: products.length })}
          </p>
          <button
            type="button"
            onClick={exportAll}
            aria-label={t("exportAllAria")}
            className="inline-flex items-center gap-1 rounded-pill border border-line bg-surface px-2 py-1 text-[11px] font-medium text-navy-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            <Download width={12} height={12} />
            {t("exportAll", { n: products.length })}
          </button>
        </div>
        {/* The export covers EVERY product (AI copy where saved, deterministic floor
            otherwise), so the button counts products; this line explains the split so
            the count isn't misread as "only the AI-copy SKUs". */}
        {products.length > 0 && (
          <p className="px-1 text-[11px] text-muted">
            {t("exportAllHint", { ai: aiCount, floor: products.length - aiCount })}
          </p>
        )}
        {showSearch && (
          <label className="relative block">
            <Search
              width={15}
              height={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchProducts")}
              aria-label={t("searchProducts")}
              className="w-full rounded-lg border border-line bg-surface py-2 pl-8 pr-2.5 text-sm text-navy-800 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </label>
        )}

        {/* batch controls: multi-select → generate for all selected, with an honest
            cost line (one generation per SKU, no bypass) + live progress. */}
        <div className="rounded-card border border-line bg-surface p-2.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSelected(Array.from(new Set([...selected, ...visibleProducts.map((p) => p.sku)])))}
              className="text-[11px] font-medium text-brand-accent hover:underline"
            >
              {t("selectAll")}
            </button>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-[11px] font-medium text-muted hover:text-navy-700"
              >
                {t("clearSelection")}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={runBatch}
            disabled={summary.count === 0 || batch.progress.running}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-pill bg-brand-700 px-3 py-2 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            <Sparkles width={14} height={14} className={batch.progress.running ? "animate-pulse" : ""} />
            {t("generateSelected", { n: summary.count })}
          </button>
          {summary.count > 0 && !batch.progress.running && (
            <p className="mt-1.5 text-[11px] leading-snug text-muted">
              {t("batchCost", { n: summary.count })}
              {summary.withExisting > 0 && ` ${t("batchOverwrite", { m: summary.withExisting })}`}
            </p>
          )}
          {(batch.progress.running || batch.progress.total > 0) && (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-navy-700">
                {batch.progress.running
                  ? t("batchRunning", { done: doneCount, total: batch.progress.total, failed: failedSkus.length })
                  : t("batchDone", { done: doneCount, total: batch.progress.total, failed: failedSkus.length })}
              </p>
              {batch.progress.running ? (
                <button type="button" onClick={batch.cancel} className="text-[11px] font-medium text-negative hover:underline">
                  {t("batchStop")}
                </button>
              ) : (
                failedSkus.length > 0 && (
                  <button type="button" onClick={retryFailed} className="text-[11px] font-medium text-brand-accent hover:underline">
                    {t("batchRetryAll", { n: failedSkus.length })}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {matched.length === 0 && (
          <p className="rounded-card border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
            {t("noMatches")}
          </p>
        )}
        {visibleProducts.map((p) => {
          const active = p.sku === sku;
          const low = p.stock <= 10;
          const isSelected = selected.includes(p.sku);
          const hasCopy = Boolean(adCopyForSku(persisted, p.sku));
          const rowState = batch.progress.status[p.sku];
          return (
            <div
              key={p.sku}
              className={`flex items-center gap-2 rounded-card border p-2 transition-colors ${
                active ? "border-brand-400 bg-brand-50/60 ring-2 ring-brand-200" : "border-line bg-surface hover:border-brand-300"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => setSelected((s) => toggleSelected(s, p.sku))}
                aria-label={t("selectForBatch", { title: p.title })}
                className="h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
              />
              <button
                type="button"
                onClick={() => setSku(p.sku)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-canvas text-xl">
                  {p.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-navy-800">{p.title}</span>
                  <span className="block text-xs text-muted">
                    {p.category} · {fmt.fmtCZK(p.price)}
                  </span>
                </span>
              </button>
              {hasCopy && !rowState && (
                <span title={t("savedBadge")}>
                  <Sparkles width={13} height={13} className="shrink-0 text-brand-accent" />
                </span>
              )}
              <RowStatus
                state={rowState}
                retryLabel={t("rowRetry")}
                onRetry={() => void batch.retryItem(p, projectId, mergeEntry)}
              />
              {low && !rowState && <Pill tone="coral">{t("lowStock", { n: p.stock })}</Pill>}
              {active && <Check width={16} height={16} className="shrink-0 text-brand-accent" />}
            </div>
          );
        })}
        {matched.length > visibleProducts.length && (
          <div className="flex flex-col items-center gap-1 pt-1">
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + CATALOG_PAGE_SIZE)}
              className="w-full rounded-card border border-line px-3 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
            >
              {t("loadMore")}
            </button>
            <span className="text-[11px] text-muted">
              {t("showing", { shown: visibleProducts.length, total: matched.length })}
            </span>
          </div>
        )}
      </div>

      {/* generated asset group */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-canvas text-2xl">
              {product.emoji}
            </span>
            <div>
              <h3 className="text-base font-semibold text-navy-800">{product.title}</h3>
              <p className="text-sm text-muted">
                {t("assetGroupSuffix", { sku: product.sku })}{" "}
                <a href={group.finalUrl} className="link-inline" target="_blank" rel="noopener noreferrer">
                  {group.finalUrl.replace("https://", "")}
                </a>
              </p>
              {showingStored && stored && (
                <p className="mt-0.5 text-xs text-muted">
                  {t("storedAge", { ago: fmt.fmtRelative(stored.generatedAt), model: stored.model })}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Pill tone={usingAi ? "positive" : "brand"}>
              <Sparkles width={13} height={13} />
              {usingAi ? t("aiTexts") : t("pmaxRsa")}
            </Pill>
            <button
              type="button"
              onClick={generate}
              disabled={status === "loading"}
              className="inline-flex items-center gap-1.5 rounded-pill bg-brand-700 px-3.5 py-2 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            >
              {status === "loading" ? (
                <>
                  <Sparkles width={14} height={14} className="animate-pulse" />
                  {t("generating")}
                </>
              ) : usingAi ? (
                <>
                  <Refresh width={14} height={14} />
                  {t("regenerate")}
                </>
              ) : (
                <>
                  <Bolt width={14} height={14} />
                  {t("generateAi")}
                </>
              )}
            </button>
            <ExportActions group={group} meta={exportMeta} t={t} />
          </div>
        </div>

        {/* generation status — loading / error / demo (keyless) mode */}
        {status === "loading" && aiSku === sku && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
            <Sparkles width={14} height={14} className="animate-pulse shrink-0" />
            {t("generatingStatus")}
          </p>
        )}
        {status === "error" && aiSku === sku && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-xs">
            <span className="text-negative">
              {timedOut
                ? t("timedOut")
                : `${t("generationFailed")}${error ? `: ${error}` : "."} ${t("generationFailedSuffix")}`}
            </span>
            <button
              type="button"
              onClick={generate}
              className="shrink-0 rounded-pill border border-line bg-surface px-2.5 py-1 font-medium text-navy-700 hover:border-brand-300"
            >
              {t("retryBtn")}
            </button>
          </div>
        )}
        {usingAi && showDemo && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-coral-soft bg-coral-soft px-3 py-2 text-xs text-coral-600">
            <Info width={14} height={14} className="shrink-0" />
            {t("demoMode")}
          </p>
        )}

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <AssetSection title={t("headlinesTitle", { n: group.headlines.length })} assets={group.headlines} />
          <div className="space-y-5">
            <AssetSection title={t("longHeadlinesTitle", { n: group.longHeadlines.length })} assets={group.longHeadlines} />
            <AssetSection title={t("descriptionsTitle", { n: group.descriptions.length })} assets={group.descriptions} />
          </div>
        </div>

        {/* AI-only extras: callouts, keywords and the model's rationale */}
        {usingAi && aiResult && (aiResult.callouts.length > 0 || aiResult.keywords.length > 0) && (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {aiResult.callouts.length > 0 && (
              <AssetSection
                title={t("calloutsTitle", { n: aiResult.callouts.length })}
                assets={aiResult.callouts.map((c) => toAsset(c, AD_LIMITS.callout))}
              />
            )}
            {aiResult.keywords.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("keywordsTitle", { n: aiResult.keywords.length })}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {aiResult.keywords.map((k, i) => (
                    <span key={i} className="rounded-pill bg-navy-50 px-3 py-1.5 text-sm text-navy-700">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {usingAi && aiResult?.rationale && (
          <div className="mt-5 rounded-card border border-brand-200 bg-brand-50 p-4">
            <p className="text-xs font-semibold text-brand-800">{t("rationaleTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed text-navy-700">{aiResult.rationale}</p>
          </div>
        )}

        <p className="mt-5 border-t border-line pt-4 text-xs text-muted">
          {usingAi
            ? t("footerAi", { hl: RSA_HEADLINE_MAX, desc: RSA_DESCRIPTION_MAX, lhl: PMAX_LONG_HEADLINE_MAX })
            : t("footerDet", { hl: RSA_HEADLINE_MAX, desc: RSA_DESCRIPTION_MAX })}
        </p>
      </div>
    </div>
  );
}
