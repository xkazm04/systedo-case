"use client";

/** Direction 3 — the executable inventory-aware budget action plan. Replaces the
 *  read-only "propose a shift" panel: select the moves, then apply them as one
 *  governed change-set (review → confirm → applied → revert), the same envelope
 *  the Kampaně control plane uses. Each move shows WHY (forecast stockout), the
 *  margin tilt, and that it lands across every channel at once — the loop a WMS
 *  can't close because it never sees the ad account. The apply is simulated in the
 *  demo; a real one routes through the audited ad-ops control plane. */
import { useMemo, useState } from "react";
import { ArrowRight, Bolt, Check, Network, Refresh } from "@/components/icons";
import { Pill } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { InventoryAction, InventoryActionPlan } from "@/lib/inventory/action-plan";

const T = {
  cs: {
    title: "Akční plán rozpočtu",
    subtitle:
      "Napojeno na sklad: přesměruj výdaje z docházejících SKU napříč všemi kanály dřív, než se vyprodají.",
    governed: "control plane · schválení + vrácení",
    noActions: "Žádný přesun není potřeba — všechny SKU mají zásobu i rozpočet v pořádku.",
    from: "Utlumit",
    to: "Posílit",
    outOfStock: "vyprodáno {date} · za {n} dní",
    outSoon: "vyprodáno {date}",
    marginTilt: "marže {from} → {to}",
    acrossChannels: "napříč {n} kanály",
    selShift: "K přesunu",
    selProtected: "Chráněná marže v riziku",
    guardOk: "V mezích pojistek",
    guardBreach: "Mimo pojistky — nutné schválení",
    apply: "Provést přesun ({n})",
    nothingSelected: "Vyberte alespoň jeden přesun",
    confirmLine: "Provést {amount} u {n} SKU napříč {ch} kanály?",
    confirm: "Potvrdit",
    cancel: "Zrušit",
    applying: "Provádím…",
    appliedTitle: "Přesun proveden",
    appliedDetail: "{n} SKU · {amount} · napříč {ch} kanály (Google, Sklik, Zboží, Heureka, Meta)",
    revert: "Vrátit přesun",
    channelsHead: "Kanály",
    footnote:
      "Simulované provedení v ukázce. Ostrý přesun projde ad-ops control plane s pojistkami, auditní stopou a jednoklikovým vrácením — a zasáhne i Sklik, Zboží.cz a Heureku, které nativní řešení Googlu neumí.",
  },
  en: {
    title: "Budget action plan",
    subtitle:
      "Wired to stock: redirect spend off soon-out SKUs across every channel before they sell out.",
    governed: "control plane · approve + revert",
    noActions: "No shift needed — every SKU has stock and budget in good shape.",
    from: "Taper",
    to: "Boost",
    outOfStock: "out of stock {date} · in {n}d",
    outSoon: "out of stock {date}",
    marginTilt: "margin {from} → {to}",
    acrossChannels: "across {n} channels",
    selShift: "To shift",
    selProtected: "Protected margin at risk",
    guardOk: "Within guardrails",
    guardBreach: "Outside guardrails — needs approval",
    apply: "Apply shift ({n})",
    nothingSelected: "Select at least one move",
    confirmLine: "Apply {amount} across {n} SKUs and {ch} channels?",
    confirm: "Confirm",
    cancel: "Cancel",
    applying: "Applying…",
    appliedTitle: "Shift applied",
    appliedDetail: "{n} SKUs · {amount} · across {ch} channels (Google, Sklik, Zboží, Heureka, Meta)",
    revert: "Revert shift",
    channelsHead: "Channels",
    footnote:
      "Simulated apply in the demo. A live shift routes through the ad-ops control plane with guardrails, an audit trail and one-click revert — and reaches Sklik, Zboží.cz and Heureka, which Google's native tooling can't.",
  },
} as const;

/** ISO YYYY-MM-DD → "D. M." (locale-neutral, no hydration risk). */
function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d}. ${m}.` : "—";
}

type Phase = "review" | "confirming" | "applying" | "applied";

export default function InventoryBudgetActions({ plan }: { plan: InventoryActionPlan }) {
  const t = useT(T);
  const fmt = useFormatters();
  const keyOf = (a: InventoryAction) => `${a.fromSku}->${a.toSku}`;

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(plan.actions.map(keyOf))
  );
  const [phase, setPhase] = useState<Phase>("review");

  const sel = useMemo(() => {
    const rows = plan.actions.filter((a) => selected.has(keyOf(a)));
    return {
      rows,
      total: rows.reduce((s, a) => s + a.amountCzk, 0),
      protectedValue: rows.reduce((s, a) => s + a.valueAtRisk, 0),
    };
  }, [plan.actions, selected]);

  const channelCount = plan.actions[0]?.channels.length ?? 0;
  const applied = phase === "applied";

  if (plan.actions.length === 0) {
    return (
      <section className="card p-5 sm:p-6">
        <Head title={t("title")} subtitle={t("subtitle")} />
        <div className="mt-4 flex items-center gap-2.5 rounded-card bg-positive-soft px-4 py-3 text-sm text-positive">
          <Check width={18} height={18} className="shrink-0" />
          {t("noActions")}
        </div>
      </section>
    );
  }

  const toggle = (k: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 py-4 sm:px-6">
        <Head title={t("title")} subtitle={t("subtitle")} />
        <Pill tone="neutral">{t("governed")}</Pill>
      </div>

      {/* applied banner */}
      {applied && (
        <div className="mx-5 mb-1 flex flex-wrap items-center justify-between gap-3 rounded-card border border-positive/30 bg-positive-soft px-4 py-3 sm:mx-6">
          <p className="flex items-center gap-2 text-sm font-medium text-positive">
            <Check width={16} height={16} className="shrink-0" />
            <span>
              <b>{t("appliedTitle")}</b> —{" "}
              {t("appliedDetail", { n: sel.rows.length, amount: fmt.fmtCZK(sel.total), ch: channelCount })}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setPhase("review")}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:border-brand-300 hover:text-brand-accent"
          >
            <Refresh width={13} height={13} />
            {t("revert")}
          </button>
        </div>
      )}

      <ul className="divide-y divide-line/70">
        {plan.actions.map((a) => {
          const k = keyOf(a);
          const on = selected.has(k);
          return (
            <li
              key={k}
              className={`flex items-start gap-3 px-5 py-4 sm:px-6 ${on ? "" : "opacity-45"} ${
                applied ? "" : "transition-opacity"
              }`}
            >
              {!applied && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(k)}
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                    on ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-transparent"
                  }`}
                >
                  <Check width={13} height={13} />
                </button>
              )}
              {applied && (
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-positive text-white">
                  <Check width={13} height={13} />
                </span>
              )}

              <div className="min-w-0 flex-1">
                {/* the move */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="text-xs font-medium uppercase tracking-wide text-coral-600">{t("from")}</span>
                  <span className="font-semibold text-navy-800">{a.fromTitle}</span>
                  <ArrowRight width={15} height={15} className="text-muted" aria-hidden />
                  <span className="text-xs font-medium uppercase tracking-wide text-positive">{t("to")}</span>
                  <span className="font-semibold text-navy-800">{a.toTitle}</span>
                  <span className="tnum ml-auto shrink-0 font-semibold text-positive">
                    +{fmt.fmtCZK(a.amountCzk)}
                  </span>
                </div>

                {/* why + margin tilt */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="flex items-center gap-1 font-medium text-coral-600">
                    <Bolt width={12} height={12} aria-hidden />
                    {a.stockoutInDays !== null
                      ? t("outOfStock", { date: fmtDay(a.stockoutAt), n: a.stockoutInDays })
                      : t("outSoon", { date: fmtDay(a.stockoutAt) })}
                  </span>
                  <span className="tnum">
                    {t("marginTilt", { from: fmt.fmtPct(a.donorMargin), to: fmt.fmtPct(a.recipientMargin) })}
                  </span>
                  <span className="text-navy-600">{a.category}</span>
                </div>

                {/* cross-channel reach — the differentiator */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Network width={13} height={13} className="text-brand-accent" aria-hidden />
                  {a.channels.map((c) => (
                    <span
                      key={c.name}
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                        c.cz
                          ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                          : "bg-navy-50 text-navy-600"
                      }`}
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* summary + apply */}
      <div className="flex flex-col gap-3 border-t border-line bg-canvas/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <span className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted">{t("selShift")}</span>
            <span className="tnum font-semibold text-navy-800">{fmt.fmtCZK(sel.total)}</span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted">{t("selProtected")}</span>
            <span className="tnum font-semibold text-navy-800">{fmt.fmtCZK(sel.protectedValue)}</span>
          </span>
          <span className="flex items-center gap-1 text-xs">
            {plan.withinGuardrails ? (
              <span className="inline-flex items-center gap-1 text-positive">
                <Check width={13} height={13} />
                {t("guardOk")}
              </span>
            ) : (
              <span className="text-coral-600">{t("guardBreach")}</span>
            )}
          </span>
        </div>

        {!applied &&
          (phase === "confirming" ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">
                {t("confirmLine", { amount: fmt.fmtCZK(sel.total), n: sel.rows.length, ch: channelCount })}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPhase("applying");
                  // simulated apply — a real one awaits the control-plane round-trip
                  setTimeout(() => setPhase("applied"), 550);
                }}
                className="rounded-pill bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                {t("confirm")}
              </button>
              <button
                type="button"
                onClick={() => setPhase("review")}
                className="rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700"
              >
                {t("cancel")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={sel.rows.length === 0 || phase === "applying"}
              onClick={() => setPhase("confirming")}
              className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-45"
            >
              <Bolt width={15} height={15} />
              {phase === "applying"
                ? t("applying")
                : sel.rows.length === 0
                  ? t("nothingSelected")
                  : t("apply", { n: sel.rows.length })}
            </button>
          ))}
      </div>

      <p className="border-t border-line px-5 py-3 text-xs text-muted sm:px-6">{t("footnote")}</p>
    </section>
  );
}

function Head({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
        <Bolt width={18} height={18} className="text-brand-accent" />
        {title}
      </h3>
      <p className="mt-1 max-w-xl text-sm text-muted">{subtitle}</p>
    </div>
  );
}
