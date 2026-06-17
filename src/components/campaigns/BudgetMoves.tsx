"use client";

import { useState } from "react";
import { ArrowRight, Bolt, Check } from "@/components/icons";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import { withMetrics, type Campaign } from "@/lib/campaigns/types";
import { fmtCZK, fmtMultiple, fmtPct, fmtSignedPct } from "@/lib/format";

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
  const { moves, simulation } = recommendBudgetMoves(campaigns.map(withMetrics));
  const { before, after } = simulation;
  const valueGain = after.conversionValue - before.conversionValue;

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
        setError(json?.error ?? "Akce se nezdařila.");
        return;
      }
      setDone((d) => ({ ...d, [key]: successLabel }));
      onApplied?.();
    } catch {
      setError("Nepodařilo se spojit se serverem.");
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
            Doporučené přesuny rozpočtu
          </h2>
          <p className="mt-1 text-sm text-muted">
            Deterministický návrh: přesun rozpočtu od podvýkonných kampaní k těm nad cílem.
          </p>
        </div>
        <span className="pill shrink-0 self-start bg-navy-50 text-muted">bez AI · okamžité</span>
      </div>

      {moves.length === 0 ? (
        <div className="mt-5 flex items-center gap-2.5 rounded-card bg-positive-soft px-4 py-3 text-sm text-positive">
          <Check width={18} height={18} className="shrink-0" />
          Rozpočet je vůči cíli vyvážený — žádné zjevné přesuny se nenabízejí.
        </div>
      ) : (
        <>
          <ul className="mt-5 space-y-3">
            {moves.map((m, i) => (
              <li key={i} className="rounded-card border border-line p-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                  <span className="font-semibold text-navy-800">Přesunout {fmtCZK(m.amount)}</span>
                  <span className="inline-flex items-center gap-1.5 text-navy-700">
                    z <span className="font-medium">{m.fromName}</span>
                    <span className="tnum text-negative">ROAS {fmtMultiple(m.fromRoas)}</span>
                  </span>
                  <ArrowRight width={15} height={15} className="text-muted" aria-label="do" />
                  <span className="inline-flex items-center gap-1.5 text-navy-700">
                    <span className="font-medium">{m.toName}</span>
                    <span className="tnum text-positive">ROAS {fmtMultiple(m.toRoas)}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted">
                    Odhadovaný přínos:{" "}
                    <span className="tnum font-semibold text-positive">+{fmtCZK(m.estValueGain)}</span>{" "}
                    hodnoty konverzí.
                  </p>
                  {(() => {
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
                          <span className="text-muted">Přesunout {fmtCZK(m.amount)} v Google Ads?</span>
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
                                "Přesun aplikován"
                              )
                            }
                            disabled={busy === shiftKey}
                            className="rounded-pill bg-brand-600 px-2.5 py-1 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                          >
                            {busy === shiftKey ? "Aplikuji…" : "Potvrdit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="rounded-pill border border-line px-2.5 py-1 font-medium text-navy-700"
                          >
                            Zrušit
                          </button>
                        </span>
                      );
                    }
                    if (confirming === pauseKey) {
                      return (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="text-muted">Pozastavit „{m.fromName}“?</span>
                          <button
                            type="button"
                            onClick={() =>
                              apply(
                                pauseKey,
                                { action: "pause", campaignId: m.fromId, campaignName: m.fromName },
                                "Zdroj pozastaven"
                              )
                            }
                            disabled={busy === pauseKey}
                            className="rounded-pill bg-coral-500 px-2.5 py-1 font-semibold text-white hover:bg-coral-600 disabled:opacity-50"
                          >
                            {busy === pauseKey ? "Pozastavuji…" : "Potvrdit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="rounded-pill border border-line px-2.5 py-1 font-medium text-navy-700"
                          >
                            Zrušit
                          </button>
                        </span>
                      );
                    }
                    return (
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirming(shiftKey)}
                          title="Přesunout rozpočet mezi kampaněmi v Google Ads (živý účet)"
                          className="rounded-pill bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                        >
                          Aplikovat přesun
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(pauseKey)}
                          title="Pozastavit podvýkonnou kampaň v Google Ads (živý účet)"
                          className="rounded-pill border border-line px-2.5 py-1 text-xs font-medium text-navy-700 transition-colors hover:border-coral-400/60 hover:text-coral-600"
                        >
                          Pozastavit zdroj
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
              label="ROAS portfolia"
              before={fmtMultiple(before.roas)}
              after={fmtMultiple(after.roas)}
              good={after.roas >= before.roas}
            />
            <Impact
              label="PNO portfolia"
              before={fmtPct(before.pno)}
              after={fmtPct(after.pno)}
              good={after.pno <= before.pno}
            />
            <Impact
              label="Hodnota konverzí"
              before={fmtCZK(before.conversionValue)}
              after={fmtCZK(after.conversionValue)}
              good={valueGain >= 0}
            />
            <div className="bg-surface p-3">
              <p className="text-xs text-muted">Změna hodnoty</p>
              <p
                className={`tnum mt-1 text-lg font-semibold ${
                  valueGain >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {fmtSignedPct(before.conversionValue > 0 ? valueGain / before.conversionValue : 0)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Odhad lineárně extrapoluje současnou efektivitu kampaní; skutečný dopad ověří
            další synchronizace. „Aplikovat přesun“ upraví denní rozpočty přímo v Google Ads
            (jen u připojeného živého účtu, s potvrzením a auditem).
          </p>
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
