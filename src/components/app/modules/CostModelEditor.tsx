"use client";

/** A3 — the report's cost-model control. Set → a "profit after costs" strip with
 *  the margin/overhead in effect + edit/remove; unset → a "zadejte marži" CTA. The
 *  form posts the blended gross margin, monthly overhead and per-order cost to the
 *  cost-model route so the report's Zisk tile shows true net profit. Client. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useFormatters } from "@/lib/i18n/client";
import type { BreakEven } from "@/lib/cost-model/compute";

export interface CostModelView {
  grossMarginPct: number;
  monthlyOverhead: number;
  perOrderCost: number;
}

const T = {
  cs: {
    active: "Zisk po nákladech · marže {m} · režie {o}/měs · {f}/obj.",
    breakEven: "Bod zvratu podle marže: ROAS {roas} (hrubý)",
    breakEvenLoaded: ", s režií ROAS {roas}",
    inactive: "Zisk je zatím jen příspěvek (obrat − reklama). Zadejte marži a režii pro skutečný zisk po nákladech.",
    set: "Zadat marži",
    edit: "Upravit",
    remove: "Zrušit model",
    margin: "Hrubá marže (%)",
    overhead: "Měsíční režie (Kč)",
    perOrder: "Náklad na objednávku (Kč)",
    save: "Uložit",
    saving: "Ukládám…",
    failed: "Uložení se nezdařilo.",
  },
  en: {
    active: "Profit after costs · margin {m} · overhead {o}/mo · {f}/order",
    breakEven: "Margin-based break-even: ROAS {roas} (gross)",
    breakEvenLoaded: ", with overhead ROAS {roas}",
    inactive: "Profit is still contribution (revenue − ads). Enter margin & overhead for true net profit after costs.",
    set: "Set margin",
    edit: "Edit",
    remove: "Remove model",
    margin: "Gross margin (%)",
    overhead: "Monthly overhead (Kč)",
    perOrder: "Cost per order (Kč)",
    save: "Save",
    saving: "Saving…",
    failed: "Save failed.",
  },
} as const;

export default function CostModelEditor({
  projectId,
  model,
  breakEven = null,
}: {
  projectId: string;
  model: CostModelView | null;
  breakEven?: BreakEven | null;
}) {
  const t = useT(T);
  const { fmtPct, fmtCZK, fmtMultiple } = useFormatters();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [margin, setMargin] = useState(model ? String(Math.round(model.grossMarginPct * 100)) : "45");
  const [overhead, setOverhead] = useState(model ? String(model.monthlyOverhead) : "0");
  const [perOrder, setPerOrder] = useState(model ? String(model.perOrderCost) : "0");

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/cost-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grossMarginPct: Number(margin) / 100,
          monthlyOverhead: Number(overhead),
          perOrderCost: Number(perOrder),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setErr(json.error || t("failed"));
      }
    } catch {
      setErr(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/projects/${projectId}/cost-model`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const strip = model
    ? { cls: "bg-positive-soft text-positive", text: t("active", { m: fmtPct(model.grossMarginPct, 0), o: fmtCZK(model.monthlyOverhead), f: fmtCZK(model.perOrderCost) }) }
    : { cls: "bg-canvas text-muted", text: t("inactive") };

  // Direction 2: the margin-derived break-even ROAS as the target the profit line
  // is judged against — gross (1/margin) always, plus the overhead-loaded variant
  // when the model carries overhead/fulfilment. Only when a model exists.
  const breakEvenText =
    model && breakEven && Number.isFinite(breakEven.grossRoas)
      ? t("breakEven", { roas: fmtMultiple(breakEven.grossRoas) }) +
        (breakEven.loadedRoas !== undefined && Number.isFinite(breakEven.loadedRoas)
          ? t("breakEvenLoaded", { roas: fmtMultiple(breakEven.loadedRoas) })
          : "")
      : null;

  return (
    <div className={`rounded-lg px-4 py-3 text-xs leading-relaxed ${strip.cls}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-medium">
          {strip.text}
          {breakEvenText && <span className="ml-1.5 font-normal opacity-80">· {breakEvenText}</span>}
        </span>
        <div className="flex items-center gap-2 print:hidden">
          {model && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
            >
              {t("remove")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300"
          >
            {model ? t("edit") : t("set")}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label={t("margin")} value={margin} onChange={setMargin} />
          <Field label={t("overhead")} value={overhead} onChange={setOverhead} />
          <Field label={t("perOrder")} value={perOrder} onChange={setPerOrder} />
          <div className="sm:col-span-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || !margin.trim()}
              className="rounded-pill bg-brand-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? t("saving") : t("save")}
            </button>
            {err && <span className="text-negative">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium text-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tnum w-full rounded-card border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-300 focus:outline-none"
      />
    </label>
  );
}
