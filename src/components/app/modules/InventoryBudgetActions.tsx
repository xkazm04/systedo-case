"use client";

/** Direction 1 — the inventory-aware budget action plan, made HONEST. Each proposed
 *  move (redirect spend off a soon-out SKU across every channel, toward a healthy one)
 *  can be Accepted or Dismissed; the decision persists per project (proposed →
 *  accepted | dismissed) so it survives a reload and the team can track it. Accepting
 *  does NOT touch any ad account — Adamant has no write access here — and the UI says
 *  so plainly. This replaces the previous setTimeout "apply → applied → revert" theatre
 *  that pretended a control-plane mutation ran. Each move still shows WHY (forecast
 *  stockout), the margin tilt, and that it spans every channel at once — the loop a WMS
 *  can't close because it never sees the ad account. */
import { useMemo, useState } from "react";
import { ArrowRight, Bolt, Check, Network } from "@/components/icons";
import { Pill } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { InventoryActionPlan } from "@/lib/inventory/action-plan";
import { moveKey, type MoveState } from "@/lib/inventory/plan-types";

const T = {
  cs: {
    title: "Akční plán rozpočtu",
    subtitle:
      "Napojeno na sklad: doporučené přesměrování výdajů z docházejících SKU napříč všemi kanály. Přijměte, co dává smysl — provedení je na vás.",
    recommendation: "doporučení · neprovádí změny",
    noActions: "Žádný přesun není potřeba — všechny SKU mají zásobu i rozpočet v pořádku.",
    from: "Utlumit",
    to: "Posílit",
    outOfStock: "vyprodáno {date} · za {n} dní",
    outSoon: "vyprodáno {date}",
    marginTilt: "marže {from} → {to}",
    guardOk: "V mezích pojistek",
    guardBreach: "Mimo pojistky — vyžádá schválení",
    accept: "Přijmout",
    dismiss: "Zamítnout",
    accepted: "Uloženo",
    dismissed: "Zamítnuto",
    undo: "Vrátit",
    savedNote: "Doporučení uloženo — nedotýká se reklamních účtů.",
    explain:
      "„Přijmout“ uloží doporučení pro váš tým. Adamant neprovádí žádné změny v reklamních účtech.",
    saveFailed: "Uložení se nezdařilo.",
    acceptedCount: "{n} přijato",
    dismissedCount: "{n} zamítnuto",
    footnote:
      "Doporučení zasahují i Sklik, Zboží.cz a Heureku, které nativní řešení Googlu neřeší. Samotnou úpravu rozpočtů provedeš ve svých účtech — Adamant je nemění.",
  },
  en: {
    title: "Budget action plan",
    subtitle:
      "Wired to stock: recommended redirection of spend off soon-out SKUs across every channel. Accept what makes sense — the change is yours to make.",
    recommendation: "recommendation · makes no changes",
    noActions: "No shift needed — every SKU has stock and budget in good shape.",
    from: "Taper",
    to: "Boost",
    outOfStock: "out of stock {date} · in {n}d",
    outSoon: "out of stock {date}",
    marginTilt: "margin {from} → {to}",
    guardOk: "Within guardrails",
    guardBreach: "Outside guardrails — needs approval",
    accept: "Accept",
    dismiss: "Dismiss",
    accepted: "Saved",
    dismissed: "Dismissed",
    undo: "Undo",
    savedNote: "Recommendation saved — does not touch ad accounts.",
    explain: "“Accept” saves the recommendation for your team. Adamant makes no changes to any ad account.",
    saveFailed: "Save failed.",
    acceptedCount: "{n} accepted",
    dismissedCount: "{n} dismissed",
    footnote:
      "Recommendations span Sklik, Zboží.cz and Heureka too, which Google's native tooling can't. You make the actual budget change in your own accounts — Adamant doesn't touch them.",
  },
} as const;

/** ISO YYYY-MM-DD → "D. M." (locale-neutral, no hydration risk). */
function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d}. ${m}.` : "—";
}

export default function InventoryBudgetActions({
  plan,
  projectId,
  digest,
  initialStates = {},
}: {
  plan: InventoryActionPlan;
  /** the project whose /inventory-plan endpoint persists the decisions; omit for demo
   *  (illustrative) projects → the accept/dismiss stays local, never persisted. */
  projectId?: string;
  /** the inputs digest of THIS proposal — persisted with the plan so a later reload
   *  can tell whether the saved states still describe the current SKUs. */
  digest: string;
  /** per-move state resolved server-side from the saved plan (proposed by default). */
  initialStates?: Record<string, MoveState>;
}) {
  const t = useT(T);
  const fmt = useFormatters();

  const [states, setStates] = useState<Record<string, MoveState>>(() => {
    const seed: Record<string, MoveState> = {};
    for (const a of plan.actions) seed[moveKey(a)] = initialStates[moveKey(a)] ?? "proposed";
    return seed;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    let accepted = 0;
    let dismissed = 0;
    let acceptedCzk = 0;
    for (const a of plan.actions) {
      const s = states[moveKey(a)];
      if (s === "accepted") {
        accepted += 1;
        acceptedCzk += a.amountCzk;
      } else if (s === "dismissed") {
        dismissed += 1;
      }
    }
    return { accepted, dismissed, acceptedCzk };
  }, [plan.actions, states]);

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

  async function setMove(key: string, state: MoveState) {
    // Serialized: every decision button is disabled while a save is in flight (see
    // `busy` below), so no concurrent decision can build a POST from a stale snapshot or
    // roll back a decision another row already persisted. Roll back ONLY this key on
    // failure (never the whole plan), so an earlier accepted move can't be un-persisted.
    const prevValue = states[key] ?? "proposed";
    const next = { ...states, [key]: state };
    setStates(next);
    setError(null);
    if (!projectId) return; // demo / local-only — nothing to persist to

    setBusy(true);
    try {
      const moves = plan.actions.map((a) => {
        const k = moveKey(a);
        return { key: k, fromSku: a.fromSku, toSku: a.toSku, amountCzk: a.amountCzk, state: next[k] ?? "proposed" };
      });
      const res = await fetch(`/api/projects/${projectId}/inventory-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputsDigest: digest, moves }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setStates((s) => ({ ...s, [key]: prevValue }));
        setError(t("saveFailed"));
      }
    } catch {
      setStates((s) => ({ ...s, [key]: prevValue }));
      setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 py-4 sm:px-6">
        <Head title={t("title")} subtitle={t("subtitle")} />
        <Pill tone="neutral">{t("recommendation")}</Pill>
      </div>

      {/* honest standing note — accept saves a recommendation, it doesn't execute. */}
      <div className="mx-5 mb-1 rounded-card border border-line bg-canvas px-4 py-2.5 text-xs leading-relaxed text-navy-700 sm:mx-6">
        {summary.accepted > 0 ? (
          <span className="flex items-center gap-2 font-medium text-positive">
            <Check width={14} height={14} className="shrink-0" />
            {t("savedNote")}
          </span>
        ) : (
          t("explain")
        )}
      </div>

      <ul className="divide-y divide-line/70">
        {plan.actions.map((a) => {
          const k = moveKey(a);
          const state = states[k] ?? "proposed";
          const dim = state === "dismissed";
          return (
            <li key={k} className={`flex items-start gap-3 px-5 py-4 sm:px-6 ${dim ? "opacity-45" : ""}`}>
              <div className="min-w-0 flex-1">
                {/* the move */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="text-xs font-medium uppercase tracking-wide text-coral-600">{t("from")}</span>
                  <span className="font-semibold text-navy-800">{a.fromTitle}</span>
                  <ArrowRight width={15} height={15} className="text-muted" aria-hidden />
                  <span className="text-xs font-medium uppercase tracking-wide text-positive">{t("to")}</span>
                  <span className="font-semibold text-navy-800">{a.toTitle}</span>
                  <span className="tnum ml-auto shrink-0 font-semibold text-positive">+{fmt.fmtCZK(a.amountCzk)}</span>
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
                        c.cz ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "bg-navy-50 text-navy-600"
                      }`}
                    >
                      {c.name}
                    </span>
                  ))}
                </div>

                {/* per-move decision */}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {state === "proposed" ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setMove(k, "accepted")}
                        className="inline-flex items-center gap-1.5 rounded-pill bg-brand-700 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
                      >
                        <Check width={13} height={13} />
                        {t("accept")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setMove(k, "dismissed")}
                        className="rounded-pill border border-line bg-surface px-3 py-1.5 font-medium text-navy-700 transition-colors hover:border-coral-300 disabled:opacity-50"
                      >
                        {t("dismiss")}
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${
                          state === "accepted" ? "text-positive" : "text-muted"
                        }`}
                      >
                        {state === "accepted" && <Check width={13} height={13} />}
                        {state === "accepted" ? t("accepted") : t("dismissed")}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setMove(k, "proposed")}
                        className="rounded-pill border border-line bg-surface px-2.5 py-1 font-medium text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
                      >
                        {t("undo")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* summary */}
      <div className="flex flex-col gap-3 border-t border-line bg-canvas/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <span className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted">{t("acceptedCount", { n: summary.accepted })}</span>
            <span className="tnum font-semibold text-navy-800">{fmt.fmtCZK(summary.acceptedCzk)}</span>
          </span>
          {summary.dismissed > 0 && (
            <span className="text-xs text-muted">{t("dismissedCount", { n: summary.dismissed })}</span>
          )}
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
          {error && <span className="text-xs text-negative">{error}</span>}
        </div>
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
