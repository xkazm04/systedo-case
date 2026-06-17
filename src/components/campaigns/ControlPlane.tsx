"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bolt, Check, Refresh, Info } from "@/components/icons";
import { fmtCZK, fmtMultiple, fmtPct, fmtRelative } from "@/lib/format";
import { projectedValueGain, type ChangeSet, type ChangeSetStatus } from "@/lib/campaigns/control-plane-types";

const STATUS_LABEL: Record<ChangeSetStatus, string> = {
  pending: "Čeká na schválení",
  applied: "Aplikováno",
  reverted: "Vráceno",
};
const STATUS_STYLE: Record<ChangeSetStatus, string> = {
  pending: "bg-coral-soft text-coral-600",
  applied: "bg-positive-soft text-positive",
  reverted: "bg-navy-50 text-muted",
};

/** Ad-ops control plane: bundle recommended budget moves into a simulated,
 *  human-approved change-set with a reversible ledger. The governance envelope
 *  that makes touching real spend safe. Anonymous → hidden. */
export default function ControlPlane() {
  const { status } = useSession();
  const [sets, setSets] = useState<ChangeSet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns/control-plane");
      if (!res.ok) return;
      const json = (await res.json()) as { changeSets?: ChangeSet[] };
      setSets(json.changeSets ?? []);
    } catch {
      /* non-critical */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load]);

  const act = async (action: "create" | "approve" | "revert", id?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/control-plane", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const json = await res.json();
      if (!res.ok) setError(json?.error ?? "Akce se nezdařila.");
      await load();
    } catch {
      setError("Nepodařilo se spojit se serverem.");
    } finally {
      setBusy(false);
      setConfirmId(null);
    }
  };

  if (status !== "authenticated" || !loaded) return null;

  const pending = sets.find((s) => s.status === "pending");

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bolt width={16} height={16} className="text-brand-accent" />
          <h2 className="text-base font-semibold text-navy-800">Řízení rozpočtů (control plane)</h2>
        </div>
        <button
          type="button"
          onClick={() => act("create")}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-pill border border-line px-4 py-2 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-60"
        >
          <Refresh width={15} height={15} className={busy ? "animate-spin" : ""} />
          Navrhnout změnový balíček
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">
        Dávka doporučených přesunů rozpočtu — nejdřív simulace dopadu, pak lidské schválení, vždy
        s možností vrácení. Bezpečný způsob, jak nechat software sahat na reálnou útratu.
      </p>

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}

      {/* pending change-set — the approval gate */}
      {pending && (
        <div className="mt-4 rounded-card border border-coral-200 bg-coral-soft/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-navy-800">Návrh ke schválení</span>
            <span className={`pill ${STATUS_STYLE.pending}`}>{STATUS_LABEL.pending}</span>
          </div>

          <ul className="mt-3 space-y-1.5">
            {pending.moves.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                <span className="text-navy-800">
                  {m.fromName} <span className="text-muted">→</span> {m.toName}
                </span>
                <span className="tnum text-muted">
                  {fmtCZK(m.amount)} · +{fmtCZK(m.estValueGain)}
                </span>
              </li>
            ))}
          </ul>

          {/* simulated impact */}
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <SimCell label="ROAS" before={fmtMultiple(pending.simulation.before.roas)} after={fmtMultiple(pending.simulation.after.roas)} />
            <SimCell label="PNO" before={fmtPct(pending.simulation.before.pno)} after={fmtPct(pending.simulation.after.pno)} />
            <SimCell label="Hodnota" before={fmtCZK(pending.simulation.before.conversionValue)} after={fmtCZK(pending.simulation.after.conversionValue)} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Projektovaný přínos ≈ <strong className="text-navy-700">{fmtCZK(projectedValueGain(pending.simulation))}</strong> hodnoty konverzí (lineární odhad).
          </p>

          {pending.violations.length > 0 && (
            <ul className="mt-3 space-y-1">
              {pending.violations.map((v, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-coral-600">
                  <Info width={13} height={13} className="mt-0.5 shrink-0" />
                  {v}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => (confirmId === pending.id ? act("approve", pending.id) : setConfirmId(pending.id))}
            disabled={busy}
            className={`mt-3 inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              confirmId === pending.id ? "bg-negative hover:bg-negative/90" : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            <Check width={15} height={15} />
            {confirmId === pending.id ? "Potvrdit a aplikovat na účet" : "Schválit a aplikovat"}
          </button>
        </div>
      )}

      {/* ledger */}
      {sets.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Historie balíčků</h3>
          <ul className="mt-2 space-y-1.5">
            {sets.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className={`pill ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                  <span className="text-navy-800">{s.moves.length} přesunů</span>
                  {s.results && (
                    <span className="text-xs text-muted">
                      {s.results.filter((r) => r.ok).length}/{s.results.length} aplikováno
                    </span>
                  )}
                  <time className="text-xs text-muted">{fmtRelative(s.createdAt)}</time>
                </span>
                {s.status === "applied" && (
                  <button
                    type="button"
                    onClick={() => act("revert", s.id)}
                    disabled={busy}
                    className="text-xs font-medium text-brand-accent hover:underline disabled:opacity-60"
                  >
                    Vrátit zpět
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SimCell({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="rounded-lg bg-surface px-2 py-2">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-0.5 text-xs text-muted">
        <span className="tnum">{before}</span>
        <span className="mx-1">→</span>
        <span className="tnum font-semibold text-navy-800">{after}</span>
      </p>
    </div>
  );
}
