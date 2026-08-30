"use client";

/** WP S1b — the SEARCH-TERMS panel: what the account's money actually bought at the
 *  query level, and one governed action on it.
 *
 *  Two short lists (SearchTermsLists) show the costliest queries that converted
 *  NOTHING and the ones that converted, both read from the SAME stored sync the
 *  recommender scores — so the operator sees exactly the rows the proposal is built
 *  from rather than being asked to trust a number that only appears after the click.
 *
 *  The button proposes; it never writes. It POSTs `moveSource: "terms"` to the same
 *  control-plane create action every other proposal uses, so a negative keyword ends
 *  up behind the same simulate → guardrail → approve → revert envelope as a budget
 *  shift. There is no path from this panel to the account that skips that. */

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { Bolt, Info } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useOptionalProject } from "@/lib/projects/context";
import { useAsyncAction } from "@/components/hooks/useAsyncAction";
import { useAuthedResource } from "./useAuthedResource";
import type { SearchTermRow } from "@/lib/campaigns/store/search-terms";
import {
  PROMOTE_MIN_CONVERSIONS,
  TERM_MIN_CLICKS,
  TERM_MIN_SPEND_CZK,
} from "@/lib/campaigns/term-moves";
import SearchTermsLists from "./SearchTermsLists";
import PillButton from "./PillButton";

const T = {
  cs: {
    heading: "Vyhledávací dotazy",
    subtitle:
      "Co lidé skutečně hledali, než klikli. Dotazy bez jediné konverze lze vyloučit," +
      " ty, které konvertují, povýšit na vlastní klíčové slovo v přesné shodě.",
    pill: "bez AI · z poslední synchronizace",
    empty:
      "Zatím nemáme uložené žádné dotazy. Objeví se po synchronizaci živého účtu Google Ads —" +
      " z ukázkových dat se dotazy záměrně neberou.",
    thresholds:
      "Prahy: vyloučit až od {spend} a {clicks} prokliků bez jediné konverze; povýšit od" +
      " {conv} konverzí u dotazu, který ještě není v přesné shodě.",
    propose: "Navrhnout negativa",
    proposing: "Vytvářím návrh…",
    proposed: "Návrh vytvořen. Schvalte jej v control plane níže.",
    proposeTitle: "Vytvořit změnový balíček z vyhledávacích dotazů v Řízení rozpočtů níže",
    errorFailed: "Akce se nezdařila.",
    errorServer: "Nepodařilo se spojit se serverem.",
  },
  en: {
    heading: "Search terms",
    subtitle:
      "What people actually typed before they clicked. Queries with no conversion at all can be" +
      " excluded; the ones that convert can be promoted to their own exact-match keyword.",
    pill: "no AI · from the last sync",
    empty:
      "No stored queries yet. They appear after a live Google Ads sync — queries are deliberately" +
      " never taken from sample data.",
    thresholds:
      "Thresholds: exclude only from {spend} and {clicks} clicks with no conversion at all;" +
      " promote from {conv} conversions on a query that is not already exact match.",
    propose: "Propose negatives",
    proposing: "Creating proposal…",
    proposed: "Proposal created. Approve it in the control plane below.",
    proposeTitle: "Create a change set from the search terms in the control plane below",
    errorFailed: "Action failed.",
    errorServer: "Could not reach the server.",
  },
} as const;

const EMPTY: SearchTermRow[] = [];

export default function SearchTermsPanel({
  refreshKey = 0,
  fmtMoney,
  onProposed,
}: {
  refreshKey?: number;
  /** currency-aware formatter threaded from CampaignsClient (Direction 2), so a
   *  foreign account's query costs are labelled in its own currency */
  fmtMoney?: (n: number) => string;
  /** bump the control-plane ledger below, exactly as BudgetMoves does */
  onProposed?: () => void;
}) {
  const { status } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const fmt = useFormatters();
  const money = fmtMoney ?? fmt.fmtCZK;
  const t = useT(T);
  const { busy, error, setError, run } = useAsyncAction();
  const [proposed, setProposed] = useState(false);

  // `terms=1` is an opt-in flag on the control-plane GET: the ledger read runs on
  // every console render, and it must not pay for this document unless the panel
  // that uses it is actually mounted.
  const fetchTerms = useCallback(async (): Promise<SearchTermRow[] | undefined> => {
    const qs = new URLSearchParams({ terms: "1" });
    if (pid) qs.set("projectId", pid);
    const res = await fetch(`/api/campaigns/control-plane?${qs.toString()}`);
    if (!res.ok) return undefined;
    const json = (await res.json()) as { searchTerms?: SearchTermRow[] };
    return json.searchTerms ?? [];
  }, [pid]);
  const { data: terms, loading } = useAuthedResource<SearchTermRow[]>(fetchTerms, EMPTY, refreshKey);

  const propose = () =>
    run(
      async () => {
        const res = await fetch("/api/campaigns/control-plane", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", moveSource: "terms", projectId: pid }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json?.error ?? t("errorFailed"));
          return;
        }
        setProposed(true);
        onProposed?.();
      },
      { serverError: t("errorServer") }
    );

  if (status !== "authenticated" || loading) return null;

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

      {/* An empty store is stated, not hidden: "no queries" here means the account has
          not had a live sync (or is on sample data, which deliberately yields none) —
          which is a different thing from "your queries are all fine". */}
      {terms.length === 0 ? (
        <p className="mt-4 flex items-start gap-1.5 rounded-card bg-navy-50 px-3 py-2 text-sm text-muted">
          <Info width={14} height={14} className="mt-0.5 shrink-0" />
          {t("empty")}
        </p>
      ) : (
        <>
          <SearchTermsLists terms={terms} money={money} />

          <p className="mt-3 text-xs text-muted">
            {t("thresholds")
              .replace("{spend}", money(TERM_MIN_SPEND_CZK))
              .replace("{clicks}", String(TERM_MIN_CLICKS))
              .replace("{conv}", String(PROMOTE_MIN_CONVERSIONS))}
          </p>

          {error && <p className="mt-3 text-sm text-negative">{error}</p>}

          <div className="mt-4">
            {proposed ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
                {t("proposed")}
              </span>
            ) : (
              <PillButton size="md" onClick={propose} disabled={busy} title={t("proposeTitle")}>
                {busy ? t("proposing") : t("propose")}
              </PillButton>
            )}
          </div>
        </>
      )}
    </section>
  );
}
