"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Bolt, Check } from "@/components/icons";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import { withMetrics, type Campaign } from "@/lib/campaigns/types";
import { useOptionalProject } from "@/lib/projects/context";
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
    propose: "Navrhnout do control plane",
    proposing: "Vytvářím návrh…",
    proposed: "Návrh vytvořen — schvalte jej v control plane níže.",
    proposeTitle:
      "Vytvořit změnový balíček (simulace → schválení → vrácení) v Řízení rozpočtů níže",
    roasPortfolio: "ROAS portfolia",
    pnoPortfolio: "PNO portfolia",
    convValue: "Hodnota konverzí",
    valueChange: "Změna hodnoty",
    footnote:
      "Odhad lineárně extrapoluje současnou efektivitu kampaní; skutečný dopad ověří" +
      " další synchronizace. Akce se <strong>nespouští přímo</strong> — tlačítko vytvoří" +
      " <strong>změnový balíček</strong> (přesuny i pozastavení) v sekci" +
      " <strong>Řízení rozpočtů (control plane)</strong> níže, kde návrh nejdřív uvidíte" +
      " se simulací a pojistkami, schválíte jej a kdykoli vrátíte zpět.",
    errorFailed: "Akce se nezdařila.",
    errorServer: "Nepodařilo se spojit se serverem.",
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
    propose: "Propose to control plane",
    proposing: "Creating proposal…",
    proposed: "Proposal created — approve it in the control plane below.",
    proposeTitle:
      "Create a change package (simulate → approve → revert) in Budget management below",
    roasPortfolio: "Portfolio ROAS",
    pnoPortfolio: "Portfolio COS",
    convValue: "Conversion value",
    valueChange: "Value change",
    footnote:
      "Estimate linearly extrapolates current campaign efficiency; the next sync will verify actual impact." +
      " Nothing is applied directly — the button creates a <strong>change package</strong> (shifts and" +
      " pauses) in <strong>Budget management (control plane)</strong> below, where you first see the" +
      " proposal with its simulation and guardrails, approve it, and can revert it at any time.",
    errorFailed: "Action failed.",
    errorServer: "Could not reach the server.",
  },
} as const;

/** Deterministic "what to do now" panel: pairs under-target spenders with
 *  over-performers (and surfaces zero-return burners as pauses) and shows the
 *  projected portfolio lift. No AI, instant — the bridge from the triage
 *  diagnosis to a quantified action. It does NOT mutate the account directly:
 *  the single action proposes a governed change-set into the control plane below
 *  (simulate → guardrail → human approval → reversible ledger). */
export default function BudgetMoves({
  campaigns,
  onProposed,
}: {
  campaigns: Campaign[];
  onProposed?: () => void;
}) {
  const { status } = useSession();
  const authed = status === "authenticated";
  const project = useOptionalProject();
  const pid = project?.id;
  // includePauses: a zero-return spender (the critical no_conversions finding)
  // surfaces here as a pause-first recommendation instead of the panel claiming
  // "budget is balanced" while the triage banner shows a budget-burner. The
  // server-side control-plane bundle uses the same option, so the proposal
  // matches what's shown here.
  const { moves, simulation } = recommendBudgetMoves(campaigns.map(withMetrics), {
    includePauses: true,
  });
  const { before, after } = simulation;
  const valueGain = after.conversionValue - before.conversionValue;
  const fmt = useFormatters();
  const t = useT(T);

  const [busy, setBusy] = useState(false);
  const [proposed, setProposed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propose = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/control-plane", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", projectId: pid }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? t("errorFailed"));
        return;
      }
      setProposed(true);
      onProposed?.();
    } catch {
      setError(t("errorServer"));
    } finally {
      setBusy(false);
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
                {m.kind === "pause" ? (
                  <p className="mt-1.5 text-xs text-muted">
                    {t("estSaving")}{" "}
                    <span className="tnum font-semibold text-positive">{fmt.fmtSignedCZK(m.amount)}</span>{" "}
                    {t("savedCost")}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted">
                    {t("estGain")}{" "}
                    <span className="tnum font-semibold text-positive">{fmt.fmtSignedCZK(m.estValueGain)}</span>{" "}
                    {t("convVal")}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {/* single governed action: propose the whole bundle into the control plane */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {authed ? (
              proposed ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-positive">
                  <Check width={15} height={15} />
                  {t("proposed")}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={propose}
                  disabled={busy}
                  title={t("proposeTitle")}
                  className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                >
                  <Bolt width={15} height={15} />
                  {busy ? t("proposing") : t("propose")}
                </button>
              )
            ) : (
              <span className="text-xs text-muted">{t("signIn")}</span>
            )}
          </div>

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
