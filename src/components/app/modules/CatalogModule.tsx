"use client";

import { useEffect, useMemo, useState } from "react";
import { Pill } from "@/components/ui";
import { Bolt, Check, Copy, Download, Info, Refresh, Sparkles } from "@/components/icons";
import { fmtCZK } from "@/lib/format";
import type { Product } from "@/lib/catalog/sample";
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
  type AssetGroupExportMeta,
} from "@/lib/catalog/export";
import { downloadText } from "@/lib/export";
import { useAiTool } from "@/components/ai/useAiTool";
import { AD_LIMITS, type AdResult } from "@/lib/ai-types";

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

/** Wrap a plain string in the {text,len,max} Asset shape so AI output renders
 *  through the same AssetSection/AssetChip layout (with the char-count badge). */
const toAsset = (text: string, max: number): Asset => ({ text, len: text.length, max });

/** Header actions to get the assembled asset group out of the screen: copy every
 *  asset as plain text, or download a Google Ads Editor-style CSV. Operates on
 *  whichever group is currently shown (AI result if present, else deterministic). */
function ExportActions({ group, meta }: { group: AssetGroup; meta: AssetGroupExportMeta }) {
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(assetGroupPlainText(group, meta));
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      /* clipboard unavailable */
    }
  }

  function exportCsv() {
    downloadText(`asset-group-${group.sku.toLowerCase()}.csv`, assetGroupCsv(group, meta));
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:bg-brand-50";

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={copyAll} className={btn} aria-label="Kopírovat vše">
        {copied ? <Check width={14} height={14} className="text-positive" /> : <Copy width={14} height={14} />}
        {copied ? "Zkopírováno" : "Kopírovat vše"}
      </button>
      <button type="button" onClick={exportCsv} className={btn} aria-label="Exportovat CSV">
        <Download width={14} height={14} />
        Exportovat CSV
      </button>
    </div>
  );
}

/** Fold a flat AdResult from the `ads` AI tool into the AssetGroup shape the UI
 *  already renders, mapping each list to the matching Google Ads limit. */
function adResultToGroup(r: AdResult, product: Product): AssetGroup {
  return {
    sku: product.sku,
    finalUrl: `https://mionelo.cz/p/${product.sku.toLowerCase()}`,
    headlines: r.headlines.map((h) => toAsset(h, AD_LIMITS.headline)),
    longHeadlines: r.longHeadline ? [toAsset(r.longHeadline, AD_LIMITS.longHeadline)] : [],
    descriptions: r.descriptions.map((d) => toAsset(d, AD_LIMITS.description)),
  };
}

export default function CatalogModule({ products }: { products: Product[] }) {
  const [sku, setSku] = useState(products[0]?.sku ?? "");
  const product = products.find((p) => p.sku === sku) ?? products[0];

  // Deterministic, offline-always asset group — the floor that renders on a clean
  // checkout and serves as the loading / error / not-yet-generated fallback.
  const deterministic = useMemo(() => (product ? buildAssetGroup(product) : null), [product]);

  // AI ad-copy generator (existing `ads` tool, via /api/ai). Additive: we only
  // swap the deterministic group for the model output once it arrives.
  const { status, data, error, timedOut, run, reset } = useAiTool<AdResult>("ads");
  // The SKU the current AI result belongs to. The hook persists results by mode
  // only, so we pin them to a SKU and ignore output meant for another product.
  const [aiSku, setAiSku] = useState<string | null>(null);

  // Switching products discards a previous SKU's AI output so the user never sees
  // copy generated for a different item; the deterministic group renders instead.
  useEffect(() => {
    if (aiSku && aiSku !== sku) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku]);

  function generate() {
    if (!product || status === "loading") return;
    setAiSku(product.sku);
    run({
      product: product.title,
      benefits: product.usps.join(", "),
      audience: "Rodiče a budoucí rodiče hledající kvalitní dětské vybavení",
      platform: "google",
      tone: "pratelsky",
    });
  }

  // Use the model output only when it exists, finished, and belongs to this SKU.
  const aiResult = status === "done" && aiSku === sku ? data?.result ?? null : null;
  const group = aiResult && product ? adResultToGroup(aiResult, product) : deterministic;
  const usingAi = Boolean(aiResult);

  if (!product || !group) return null;

  // Names mirror how the asset group lands in Google Ads Editor (campaign per
  // category, asset group per product) so the export drops straight in.
  const exportMeta: AssetGroupExportMeta = {
    campaign: `${product.category} – PMax`,
    assetGroupName: product.title,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* product feed */}
      <div className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Produktový feed · {products.length}
        </p>
        {products.map((p) => {
          const active = p.sku === sku;
          const low = p.stock <= 10;
          return (
            <button
              key={p.sku}
              type="button"
              onClick={() => setSku(p.sku)}
              className={`flex w-full items-center gap-3 rounded-card border p-3 text-left transition-colors ${
                active ? "border-brand-400 bg-brand-50/60 ring-2 ring-brand-200" : "border-line bg-surface hover:border-brand-300"
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-canvas text-xl">
                {p.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-navy-800">{p.title}</span>
                <span className="block text-xs text-muted">
                  {p.category} · {fmtCZK(p.price)}
                </span>
              </span>
              {low && <Pill tone="coral">{p.stock} ks</Pill>}
              {active && <Check width={16} height={16} className="shrink-0 text-brand-accent" />}
            </button>
          );
        })}
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
                Asset group · {product.sku} ·{" "}
                <a href={group.finalUrl} className="link-inline" target="_blank" rel="noopener noreferrer">
                  {group.finalUrl.replace("https://", "")}
                </a>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Pill tone={usingAi ? "positive" : "brand"}>
              <Sparkles width={13} height={13} />
              {usingAi ? "AI texty" : "PMax / RSA"}
            </Pill>
            <button
              type="button"
              onClick={generate}
              disabled={status === "loading"}
              className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            >
              {status === "loading" ? (
                <>
                  <Sparkles width={14} height={14} className="animate-pulse" />
                  Generuji…
                </>
              ) : usingAi ? (
                <>
                  <Refresh width={14} height={14} />
                  Generovat znovu
                </>
              ) : (
                <>
                  <Bolt width={14} height={14} />
                  Generovat AI texty
                </>
              )}
            </button>
            <ExportActions group={group} meta={exportMeta} />
          </div>
        </div>

        {/* generation status — loading / error / demo (keyless) mode */}
        {status === "loading" && aiSku === sku && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
            <Sparkles width={14} height={14} className="animate-pulse shrink-0" />
            Generuji on-brand texty modelem… mezitím vidíte sestavený návrh z feedu.
          </p>
        )}
        {status === "error" && aiSku === sku && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-xs">
            <span className="text-negative">
              {timedOut
                ? "Model neodpověděl včas — zobrazujeme sestavený návrh z feedu."
                : `Generování selhalo${error ? `: ${error}` : "."} Zobrazujeme návrh z feedu.`}
            </span>
            <button
              type="button"
              onClick={generate}
              className="shrink-0 rounded-pill border border-line bg-surface px-2.5 py-1 font-medium text-navy-700 hover:border-brand-300"
            >
              Zkusit znovu
            </button>
          </div>
        )}
        {usingAi && data?.meta.demo && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-coral-soft bg-coral-soft px-3 py-2 text-xs text-coral-600">
            <Info width={14} height={14} className="shrink-0" />
            Ukázkový režim (bez API klíče) — připojte LLM pro generování modelem.
          </p>
        )}

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <AssetSection title={`Headliny (${group.headlines.length})`} assets={group.headlines} />
          <div className="space-y-5">
            <AssetSection title={`Dlouhé headliny (${group.longHeadlines.length})`} assets={group.longHeadlines} />
            <AssetSection title={`Popisky (${group.descriptions.length})`} assets={group.descriptions} />
          </div>
        </div>

        {/* AI-only extras: callouts, keywords and the model's rationale */}
        {usingAi && aiResult && (aiResult.callouts.length > 0 || aiResult.keywords.length > 0) && (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {aiResult.callouts.length > 0 && (
              <AssetSection
                title={`Odznaky (${aiResult.callouts.length})`}
                assets={aiResult.callouts.map((c) => toAsset(c, AD_LIMITS.callout))}
              />
            )}
            {aiResult.keywords.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Klíčová slova ({aiResult.keywords.length})
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
            <p className="text-xs font-semibold text-brand-800">Proč právě takhle</p>
            <p className="mt-1 text-sm leading-relaxed text-navy-700">{aiResult.rationale}</p>
          </div>
        )}

        <p className="mt-5 border-t border-line pt-4 text-xs text-muted">
          {usingAi
            ? `On-brand texty vygenerované AI (mode „ads" přes /api/ai), s kontrolou limitů Google Ads (headline ${RSA_HEADLINE_MAX}, popisek ${RSA_DESCRIPTION_MAX}, dlouhý headline ${PMAX_LONG_HEADLINE_MAX} znaků).`
            : `Sestaveno z feedu podle limitů Google Ads (headline ${RSA_HEADLINE_MAX}, popisek ${RSA_DESCRIPTION_MAX} znaků). Klikněte na „Generovat AI texty" pro on-brand verzi přes /api/ai.`}
        </p>
      </div>
    </div>
  );
}
