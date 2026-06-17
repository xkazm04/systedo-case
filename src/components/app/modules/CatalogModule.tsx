"use client";

import { useMemo, useState } from "react";
import { Pill } from "@/components/ui";
import { Check, Sparkles } from "@/components/icons";
import { fmtCZK } from "@/lib/format";
import type { Product } from "@/lib/catalog/sample";
import { buildAssetGroup, type Asset } from "@/lib/catalog/generate";

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

export default function CatalogModule({ products }: { products: Product[] }) {
  const [sku, setSku] = useState(products[0]?.sku ?? "");
  const product = products.find((p) => p.sku === sku) ?? products[0];
  const group = useMemo(() => (product ? buildAssetGroup(product) : null), [product]);

  if (!product || !group) return null;

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
          <Pill tone="brand">
            <Sparkles width={13} height={13} />
            PMax / RSA
          </Pill>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <AssetSection title={`Headliny (${group.headlines.length})`} assets={group.headlines} />
          <div className="space-y-5">
            <AssetSection title={`Dlouhé headliny (${group.longHeadlines.length})`} assets={group.longHeadlines} />
            <AssetSection title={`Popisky (${group.descriptions.length})`} assets={group.descriptions} />
          </div>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-xs text-muted">
          Sestaveno z feedu podle limitů Google Ads (headline 30, popisek 90 znaků). Pro on-brand texty
          napojte AI generátor (/api/ai) a Creative Studio na vizuály.
        </p>
      </div>
    </div>
  );
}
