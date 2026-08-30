"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bolt, Refresh, Info } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useOptionalProject } from "@/lib/projects/context";
import { useAsyncAction } from "@/components/hooks/useAsyncAction";
import { useAuthedResource } from "./useAuthedResource";
import { changeSetSource, type ChangeSet } from "@/lib/campaigns/control-plane-types";
import { THREAD_ANCHORS } from "./thread";
import ChangeSetLedgerRow from "./ChangeSetLedgerRow";
import PendingProposal from "./PendingProposal";
import SourceSwitch, { type WritableSource } from "./SourceSwitch";

const T = {
  cs: {
    heading: "Řízení rozpočtů (control plane)",
    propose: "Navrhnout změnový balíček",
    subtitle:
      "Dávka doporučených přesunů rozpočtu: nejdřív simulace dopadu, pak lidské schválení, vždy" +
      " s možností vrácení. Bezpečný způsob, jak nechat software sahat na reálnou útratu.",
    ledgerHeading: "Historie balíčků",
    errorFailed: "Akce se nezdařila.",
    errorServer: "Nepodařilo se spojit se serverem.",
  },
  en: {
    heading: "Budget management (control plane)",
    propose: "Propose change set",
    subtitle:
      "A batch of recommended budget moves: impact simulation first, then human approval, always" +
      " with a rollback option. The safe way to let software touch real spend.",
    ledgerHeading: "Change set history",
    errorFailed: "Action failed.",
    errorServer: "Could not reach the server.",
  },
} as const;

/** What GET /api/campaigns/control-plane answers. `sources` is present only for a
 *  project that resolves to MORE THAN ONE writable network (ADR-0010). */
interface LedgerPayload {
  changeSets: ChangeSet[];
  sources?: WritableSource[];
  source?: WritableSource;
}

const EMPTY: LedgerPayload = { changeSets: [] };

/** Ad-ops control plane: bundle recommended budget moves into a simulated,
 *  human-approved change-set with a reversible ledger. The governance envelope
 *  that makes touching real spend safe. Anonymous → hidden. */
export default function ControlPlane({
  refreshKey = 0,
  hideProposeButton = false,
  fmtMoney,
  fmtMoneySigned,
}: {
  refreshKey?: number;
  /** Suppress the header's bare "Navrhnout změnový balíček" button. Set when the
   *  richer BudgetMoves preview renders directly above with its own single propose
   *  affordance, so the co-located budget-governance section has ONE way to
   *  propose (see CampaignsClient). */
  hideProposeButton?: boolean;
  /** Currency-aware money formatter (Direction 2), threaded from CampaignsClient so
   *  the simulation cells label a foreign account in its own currency — the SAME
   *  formatter the campaign table uses. Omitted / CZK → fmt.fmtCZK, byte-identical. */
  fmtMoney?: (n: number) => string;
  /** Currency-aware SIGNED money formatter for the pending-move gain deltas — so a
   *  foreign account no longer shows a koruna gain next to a euro-labelled amount on
   *  the same row. Omitted / CZK → fmt.fmtSignedCZK, byte-identical. */
  fmtMoneySigned?: (n: number) => string;
}) {
  const { status } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const { busy, error, setError, run } = useAsyncAction();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // WP S1 — the network the console is acting on. null = "whatever the server picks
  // by default", which is exactly the pre-S1 request (no `source` on the wire).
  const [source, setSource] = useState<WritableSource | null>(null);
  const fmt = useFormatters();
  // Currency-aware for a captured non-CZK account; fmt.fmtCZK (byte-identical) otherwise.
  const money = fmtMoney ?? fmt.fmtCZK;
  const moneySigned = fmtMoneySigned ?? fmt.fmtSignedCZK;
  const t = useT(T);

  // One clock for the whole ledger, and the first tick is SCHEDULED so the server
  // and the first client render agree on the markup (the LeadQueue shape). Only the
  // realized-impact countdown needs it, and it simply is not there until the tick.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(id);
  }, []);

  // Reload on auth resolve, whenever the BudgetMoves panel proposes a new
  // change-set (refreshKey bump), and whenever the operator switches network.
  const fetchSets = useCallback(async (): Promise<LedgerPayload | undefined> => {
    const qs = new URLSearchParams();
    if (pid) qs.set("projectId", pid);
    if (source) qs.set("source", source);
    const suffix = qs.toString();
    const res = await fetch(`/api/campaigns/control-plane${suffix ? `?${suffix}` : ""}`);
    if (!res.ok) return undefined;
    const json = (await res.json()) as Partial<LedgerPayload>;
    return { ...json, changeSets: json.changeSets ?? [] };
  }, [pid, source]);
  const {
    data: payload,
    loading,
    reload: load,
  } = useAuthedResource<LedgerPayload>(fetchSets, EMPTY, refreshKey);

  const act = (action: "create" | "approve" | "revert", id?: string, override?: boolean) =>
    run(
      async () => {
        const res = await fetch("/api/campaigns/control-plane", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, id, override, projectId: pid, ...(source ? { source } : {}) }),
        });
        const json = await res.json();
        if (!res.ok) setError(json?.error ?? t("errorFailed"));
        await load();
      },
      { serverError: t("errorServer"), onSettled: () => setConfirmId(null) }
    );

  if (status !== "authenticated" || loading) return null;

  const sets = payload.changeSets;
  const pending = sets.find((s) => s.status === "pending");
  const active = source ?? payload.source ?? "google-ads";
  // A set that carries no source stamp is Google by construction (nothing else could
  // have written it), so the Sklik confirmation is shown only when the set itself, or
  // the network the console is pointed at, actually says Sklik.
  const pendingIsSklik = pending ? (changeSetSource(pending) ?? active) === "sklik" : false;
  // A refusal from the write rails says what to do next (turn writes on, settle the
  // money unit), and that is worth surfacing rather than leaving inside "0/1
  // aplikováno". Read off the NEWEST set only, so it clears as soon as the operator
  // proposes again instead of haunting the console forever.
  const refusal =
    sets[0]?.status === "failed" ? sets[0].results?.find((r) => !r.ok && r.error)?.error : undefined;

  return (
    <section className="card p-6" id={THREAD_ANCHORS.controlPlane}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bolt width={16} height={16} className="text-brand-accent" />
          <h2 className="text-base font-semibold text-navy-800">{t("heading")}</h2>
        </div>
        {!hideProposeButton && (
          <button
            type="button"
            onClick={() => act("create")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-pill border border-line px-4 py-2 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-60"
          >
            <Refresh width={15} height={15} className={busy ? "animate-spin" : ""} />
            {t("propose")}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>

      <SourceSwitch
        sources={payload.sources ?? []}
        active={active}
        disabled={busy}
        onSelect={(s) => {
          setConfirmId(null);
          setSource(s);
        }}
      />

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}

      {!error && refusal && (
        <p className="mt-3 flex items-start gap-1.5 rounded-card bg-navy-50 px-3 py-2 text-xs text-muted">
          <Info width={14} height={14} className="mt-0.5 shrink-0" />
          {refusal}
        </p>
      )}

      {pending && (
        <PendingProposal
          pending={pending}
          busy={busy}
          confirming={confirmId === pending.id}
          isSklik={pendingIsSklik}
          onArm={() => setConfirmId(pending.id)}
          onApprove={(override) => act("approve", pending.id, override)}
          money={money}
          moneySigned={moneySigned}
        />
      )}

      {/* ledger */}
      {sets.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("ledgerHeading")}</h3>
          <ul className="mt-2 space-y-1.5">
            {sets.map((s) => (
              <ChangeSetLedgerRow
                key={s.id}
                set={s}
                busy={busy}
                now={now}
                onRevert={() => act("revert", s.id)}
                money={money}
                moneySigned={moneySigned}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
