"use client";

/** One editable catalog row, extracted from CatalogManagerModule and memoized so a
 *  keystroke re-renders ONLY this card, not the whole list. The mechanism:
 *   - text/number fields (name, price, margin, stock) hold LOCAL draft state and commit
 *     to the parent on blur/Enter — so typing never touches the parent array and never
 *     re-renders siblings;
 *   - discrete controls (nature, active, remove) commit immediately;
 *   - the parent passes STABLE callbacks (onCommit/onRemove keyed by id) and a stable
 *     translator, and updates the array immutably (unchanged rows keep their reference),
 *     so React.memo skips every card except the one whose `o` actually changed.
 *  The pure parsers/predicate live in ./offering-edit (unit-tested). */
import { memo, useState } from "react";
import type { Offering, OfferingNature } from "@/lib/catalog/offering";
import { isPlan, isProduct, isService } from "@/lib/catalog/offering";
import { INPUT_BASE, parseMarginPct, parseNumInput } from "./offering-edit";
import type { CatalogT } from "../CatalogManagerModule";

export type OfferingCommit = Partial<Offering> & { stock?: number };

function OfferingCardBase({
  o,
  t,
  onCommit,
  onRemove,
  localityName,
}: {
  o: Offering;
  t: CatalogT;
  onCommit: (id: string, changes: OfferingCommit) => void;
  onRemove: (id: string) => void;
  localityName: (id: string) => string;
}) {
  // Local drafts so a keystroke never touches the parent array. During typing `o` is
  // unchanged. When the committed offering changes (external edit, import, blur commit)
  // we re-seed the drafts DURING RENDER — React's blessed "adjust state on prop change"
  // pattern (no effect, so no cascading render; see "You Might Not Need an Effect").
  const [name, setName] = useState(o.name);
  const [price, setPrice] = useState(String(o.price));
  const [marginPct, setMarginPct] = useState(o.margin != null ? String(Math.round(o.margin * 100)) : "");
  const [stock, setStock] = useState(isProduct(o) ? String(o.stock) : "");
  const [seed, setSeed] = useState(o);
  if (seed !== o) {
    setSeed(o);
    setName(o.name);
    setPrice(String(o.price));
    setMarginPct(o.margin != null ? String(Math.round(o.margin * 100)) : "");
    if (isProduct(o)) setStock(String(o.stock));
  }

  const commitName = () => {
    if (name !== o.name) onCommit(o.id, { name });
  };
  const commitPrice = () => {
    const p = parseNumInput(price, o.price);
    setPrice(String(p));
    if (p !== o.price) onCommit(o.id, { price: p });
  };
  const commitMargin = () => {
    const m = parseMarginPct(marginPct);
    if (m !== o.margin) onCommit(o.id, { margin: m });
  };
  const commitStock = () => {
    if (!isProduct(o)) return;
    const s = parseNumInput(stock, o.stock);
    setStock(String(s));
    if (s !== o.stock) onCommit(o.id, { stock: s });
  };
  const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  const intervalLabel = isPlan(o)
    ? t(o.interval === "year" ? "year" : o.interval === "one-off" ? "oneOff" : "month")
    : "";
  const priceModelLabel = isService(o)
    ? t(o.priceModel === "fixed" ? "fixed" : o.priceModel === "quote" ? "quote" : "from")
    : "";

  return (
    <div className={`rounded-card border border-line bg-surface px-4 py-3 ${o.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={commitOnEnter}
          placeholder={t("namePh")}
          className={`${INPUT_BASE} min-w-[10rem] flex-1 font-medium`}
        />
        <label className="inline-flex items-center gap-1 text-sm text-muted">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={commitOnEnter}
            className={`${INPUT_BASE} w-24 text-right tnum`}
          />
          {t("currencyUnit")}
        </label>
        <label className="inline-flex items-center gap-1 text-sm text-muted" title={t("margin")}>
          <input
            type="number"
            value={marginPct}
            onChange={(e) => setMarginPct(e.target.value)}
            onBlur={commitMargin}
            onKeyDown={commitOnEnter}
            className={`${INPUT_BASE} w-16 text-right tnum`}
          />
          %
        </label>
        <select
          value={o.nature}
          onChange={(e) => onCommit(o.id, { nature: e.target.value as OfferingNature })}
          className={`${INPUT_BASE} cursor-pointer`}
          aria-label={t("namePh")}
        >
          <option value="online">{t("online")}</option>
          <option value="local">{t("local")}</option>
          <option value="hybrid">{t("hybrid")}</option>
        </select>
        <button
          type="button"
          onClick={() => onCommit(o.id, { active: !o.active })}
          aria-pressed={o.active}
          className={`rounded-pill px-2.5 py-1 text-xs font-semibold transition-colors ${
            o.active ? "bg-positive-soft text-positive" : "bg-navy-50 text-muted"
          }`}
        >
          {t("active")}
        </button>
        <button
          type="button"
          onClick={() => onRemove(o.id)}
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
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                onBlur={commitStock}
                onKeyDown={commitOnEnter}
                className={`${INPUT_BASE} w-16 px-2 py-0.5 text-right tnum`}
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

/** Memoized: with stable callbacks + immutable array updates from the parent, only the
 *  card whose `o` reference changed re-renders. */
export const OfferingCard = memo(OfferingCardBase);
