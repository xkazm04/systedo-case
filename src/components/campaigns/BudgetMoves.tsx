"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Bolt, Check } from "@/components/icons";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import { withMetrics, type Campaign } from "@/lib/campaigns/types";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    heading: "Doporučené přesuny rozpočtu",
    subtitle: "Deterministický návrh: přesun rozpočtu od podvýkonných kampaní k těm nad cílem.",
    pill: "bez AI · okamžité",
    balanced: "Rozpočet je vůči cíli vyvážený — žádné zjevné přesuny se nenabízejí.",
    move: "Přesunout {amount}",
    pauseMove: "Pozastavit „{name}“",
    pauseMoveSpend: "utrácí {amount} bez návratnosti",
    estGain: "Odhadovaný přínos:",
    estSaving: "Odhadovaná úspora:",
    savedCost: "nákladů bez ztráty hodnoty konverzí.",
    convVal: "hodnoty konverzí.",
    signIn: "Přihlaste se a připojte Google Ads účet pro aplikaci.",
    confirmShift: "Přesunout {amount} v Google Ads?",
    confirmPause: "Pozastavit „{name}“?",
    applying: "Aplikuji…",
    confirm: "Potvrdit",
    cancel: "Zrušit",
    shiftApplied: "Přesun aplikován",
    pausing: "Pozastavuji…",
    pauseApplied: "Zdroj pozastaven",
    applyShift: "Aplikovat přesun",
    pauseSource: "Pozastavit zdroj",
    applyShiftTitle: "Přesunout rozpočet mezi kampaněmi v Google Ads (živý účet)",
    pauseSourceTitle: "Pozastavit podvýkonnou kampaň v Google Ads (živý účet)",
    roasPortfolio: "ROAS portfolia",
    pnoPortfolio: "PNO portfolia",
    convValue: "Hodnota konverzí",
    valueChange: "Změna hodnoty",
    footnote:
      "Odhad lineárně extrapoluje současnou efektivitu kampaní; skutečný dopad ověří" +
      " další synchronizace. „Aplikovat přesun“ je <strong>okamžitá jednotlivá úprava</strong>" +
      " denních rozpočtů v Google Ads (živý účet, s potvrzením a auditem) — bez automatického" +
      " vrácení. Pro dávku přesunů se simulací, schválením a vrácením použijte" +
      " <strong>Budget management (control plane)</strong> níže.",
    errorFailed: "Action failed.",
    errorServer: "Could not reach the server.",
  },
  en: {
    heading: "Recommended budget moves",
    subtitle: "Deterministic proposal: shift budget from underperforming campaigns to those above target.",
    pill: "no AI · instant",
    balanced: "Budget is balanced against target — no obvious moves to suggest.",
    move: "Move {amount}",
    pauseMove: "Pause “{name}”",
    pauseMoveSpend: "spending {amount} with no return",
    estGain: "Estimated gain:",
    estSaving: "Estimated saving:",
    savedCost: "of spend, with no conversion value lost.",
    convVal: "conversion value.",
    signIn: "Sign in and connect a Google Ads account to apply moves.",
    confirmShift: "Move {amount} in Google Ads?",
    confirmPause: "Pause “{name}”?",
    applying: "Applying…",
    confirm: "Confirm",
    cancel: "Cancel",
    shiftApplied: "Shift applied",
    pausing: "Pausing…",
    pauseApplied: "Source paused",
    applyShift: "Apply shift",
    pauseSource: "Pause source",
    applyShiftTitle: "Shift budget between campaigns in Google Ads (live account)",
    pauseSourceTitle: "Pause underperforming campaign in Google Ads (live account)",
    roasPortfolio: "Portfolio ROAS",
    pnoPortfolio: "Portfolio COS",
    convValue: "Conversion value",
    valueChange: "Value change",
    footnote:
      "Estimate linearly extrapolates current campaign efficiency; the next sync will verify actual impact." +
      " “Apply shift” is a <strong>single immediate adjustment</strong> to daily budgets in Google Ads" +
      " (live account, with confirmation and audit) — no automatic rollback. For a batch of shifts with" +
      " simulation, approval and rollback use <strong>Budget management (control plane)</strong> below.",
    errorFailed: "Action failed.",
    errorServer: "Could not reach the server.",
  },
} as const;

/** Deterministic "what to do now" panel: pairs under-target spenders with
 *  over-performers and shows the projected portfolio lift. No AI, instant — the
 *  bridge from the triage diagnosis to a quantified action. Each move can also be
 *  acted on: pause the underperforming source in Google Ads (live accounts only,
 *  human-confirmed, audited via /api/campaigns/apply). */
export default function BudgetMoves({
  campaigns,
  onApplied,
}: {
  campaigns: Campaign[];
  onApplied?: () => void;
}) {
  const { status } = useSession();
  const authed = status === "authenticated";
  // includePauses: a zero-return spender (the critical no_conversions finding)
  // surfaces here as a pause-first recommendation instead of the panel claiming
  // "budget is balanced" while the triage banner shows a budget-burner.
  const { moves, simulation } = recommendBudgetMoves(campaigns.map(withMetrics), {
    includePauses: true,
  });
  const { before, after } = simulation;
  const valueGain = after.conversionValue - before.conversionValue;
  const fmt = useFormatters();
  const t = useT(T);

  // Confirm/busy are keyed per action ("shift:from:to" or "pause:from") so the two
  // actions on a row don't share state; `done` records the success label per key.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const apply = async (
    key: string,
    payload: Record<string, unknown>,
    successLabel: string
  ) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json?.error ?? t("errorFailed"));
        return;
      }
      setDone((d) => ({ ...d, [key]: successLabel }));
      onApplied?.();
    } catch {
      setError(t("errorServer"));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Bolt width={18} height={18} className="text-brand-600" />
            {t("heading")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <span className="pill shrink-0 self-start bg-navy-50 text-muted">{t("pill")}</span>
      </div>

      {moves.length === 0 ? (
        <div className="mt-5 flex items-center gap-2.5 rounded-card bg-positive-soft px-4 py-3 text-sm text-positive">
          <Check width={18} height={18} className="shrink-0" />
          {t("balanced")}
        </div>
      ) : (
        <>
          <ul className="mt-5 space-y-3">
            {moves.map((m, i) => (
              <li key={i} className="rounded-card border border-line p-4">
                {m.kind === "pause" ? (
                  // Pause-first row: a zero-return spender has nothing worth
                  // re-pointing — the recommendation is to stop the bleed.
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                    <span className="font-semibold text-navy-800">
                      {t("pauseMove", { name: m.fromName })}
                    </span>
                    <span className="tnum text-negative">
                      {t("pauseMoveSpend", { amount: fmt.fmtCZK(m.amount) })}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                    <span className="font-semibold text-navy-800">{t("move", { amount: fmt.fmtCZK(m.amount) })}</span>
                    <span className="inline-flex items-center gap-1.5 text-navy-700">
                      from <span className="font-medium">{m.fromName}</span>
                      <span className="tnum text-negative">ROAS {fmt.fmtMultiple(m.fromRoas)}</span>
                    </span>
                    <ArrowRight width={15} height={15} className="text-muted" aria-label="to" />
                    <span className="inline-flex items-center gap-1.5 text-navy-700">
                      <span className="font-medium">{m.toName}</span>
                      <span className="tnum text-positive">ROAS {fmt.fmtMultiple(m.toRoas)}</span>
                    </span>
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  {m.kind === "pause" ? (
                    <p className="text-xs text-muted">
                      {t("estSaving")}{" "}
                      <span className="tnum font-semibold text-positive">+{fmt.fmtCZK(m.amount)}</span>{" "}
                      {t("savedCost")}
                    </p>
                  ) : (
                    <p className="text-xs text-muted">
                      {t("estGain")}{" "}
                      <span className="tnum font-semibold text-positive">+{fmt.fmtCZK(m.estValueGain)}</span>{" "}
                      {t("convVal")}
                    </p>
                  )}
                  {(() => {
                    // Actions touch a live Google Ads account — only offered to a
                    // signed-in user (the server also 401s), so anonymous/sample
                    // visitors don't see apply/pause buttons that can't work.
                    if (!authed) {
                      return (
                        <span className="text-xs text-muted">{t("signIn")}</span>
                      );
                    }
                    const shiftKey = `shift:${m.fromId}:${m.toId}`;
                    const pauseKey = `pause:${m.fromId}`;
                    const resolved = done[shiftKey] ?? done[pauseKey];
                    if (resolved) {
                      return (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-positive">
                          <Check width={13} height={13} />
                          {resolved}
                        </span>
                      );
                    }
                    if (confirming === shiftKey) {
                      return (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="text-muted">{t("confirmShift", { amount: fmt.fmtCZK(m.amount) })}</span>
                          <button
                            type="button"
                            onClick={() =>
                              apply(
                                shiftKey,
                                {
                                  action: "budget_shift",
                                  fromId: m.fromId,
                                  fromName: m.fromName,
                                  toId: m.toId,
                                  toName: m.toName,
                                  amount: m.amount,
                                },
                                t("shiftApplied")
                              )
                            }
                            disabled={busy === shiftKey}
                            className="rounded-pill bg-brand-600 px-2.5 py-1 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                          >
                            {busy === shiftKey ? t("applying") : t("confirm")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="rounded-pill border border-line px-2.5 py-1 font-medium text-navy-700"
                          >
                            {t("cancel")}
                          </button>
                        </span>
                      );
                    }
                    if (confirming === pauseKey) {
                      return (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="text-muted">{t("confirmPause", { name: m.fromName })}</span>
                          <button
                            type="button"
                            onClick={() =>
                              apply(
                                pauseKey,
                                { action: "pause", campaignId: m.fromId, campaignName: m.fromName },
                                t("pauseApplied")
                              )
                            }
                            disabled={busy === pauseKey}
                            className="rounded-pill bg-coral-500 px-2.5 py-1 font-semibold text-white hover:bg-coral-600 disabled:opacity-50"
                          >
                            {busy === pauseKey ? t("pausing") : t("confirm")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="rounded-pill border border-line px-2.5 py-1 font-medium text-navy-700"
                          >
                            {t("cancel")}
                          </button>
                        </span>
                      );
                    }
                    return (
                      <span className="inline-flex items-center gap-1.5">
                        {/* A pause recommendation has no recipient — offering a
                            budget shift there would move money out of nothing. */}
                        {m.kind !== "pause" && (
                          <button
                            type="button"
                            onClick={() => setConfirming(shiftKey)}
                            title={t("applyShiftTitle")}
                            className="rounded-pill bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                          >
                            {t("applyShift")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirming(pauseKey)}
                          title={t("pauseSourceTitle")}
                          className={
                            m.kind === "pause"
                              ? "rounded-pill bg-coral-500 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-coral-600"
                              : "rounded-pill border border-line px-2.5 py-1 text-xs font-medium text-navy-700 transition-colors hover:border-coral-400/60 hover:text-coral-600"
                          }
                        >
                          {t("pauseSource")}
                        </button>
                      </span>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>

          {error && <p className="mt-3 text-sm text-negative">{error}</p>}

          {/* projected portfolio impact */}
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            <Impact
              label={t("roasPortfolio")}
              before={fmt.fmtMultiple(before.roas)}
              after={fmt.fmtMultiple(after.roas)}
              good={after.roas >= before.roas}
            />
            <Impact
              label={t("pnoPortfolio")}
              before={fmt.fmtPct(before.pno)}
              after={fmt.fmtPct(after.pno)}
              good={after.pno <= before.pno}
            />
            <Impact
              label={t("convValue")}
              before={fmt.fmtCZK(before.conversionValue)}
              after={fmt.fmtCZK(after.conversionValue)}
              good={valueGain >= 0}
            />
            <div className="bg-surface p-3">
              <p className="text-xs text-muted">{t("valueChange")}</p>
              <p
                className={`tnum mt-1 text-lg font-semibold ${
                  valueGain >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {fmt.fmtSignedPct(before.conversionValue > 0 ? valueGain / before.conversionValue : 0)}
              </p>
            </div>
          </div>
          <p
            className="mt-2 text-[13px] text-muted"
            dangerouslySetInnerHTML={{ __html: t("footnote") }}
          />
        </>
      )}
    </section>
  );
}

function Impact({
  label,
  before,
  after,
  good,
}: {
  label: string;
  before: string;
  after: string;
  good: boolean;
}) {
  return (
    <div className="bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 text-sm">
        <span className="tnum text-muted line-through">{before}</span>
        <span className={`tnum text-lg font-semibold ${good ? "text-positive" : "text-navy-800"}`}>
          {after}
        </span>
      </p>
    </div>
  );
}
