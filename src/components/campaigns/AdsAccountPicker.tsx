"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Check, Info, Layers, Refresh } from "@/components/icons";

interface AdsAccount {
  customerId: string;
  name: string;
}
interface AccountsResponse {
  configured?: boolean;
  accounts?: AdsAccount[];
  selected?: string | null;
  error?: string;
}

/** Connect a Google Ads account to sync: sign in with Google, list the accounts
 *  the user can access, pick one. Selecting an account triggers a live re-sync.
 *  When no developer token is configured it explains that live data is gated. */
export default function AdsAccountPicker({ onConnected }: { onConnected?: () => void }) {
  const { status } = useSession();
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/accounts");
      const json = (await res.json()) as AccountsResponse;
      if (!res.ok) {
        setError(json.error ?? "Nepodařilo se načíst účty.");
        setData(json);
        return;
      }
      setData(json);
    } catch {
      setError("Nepodařilo se spojit se serverem.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch the user's Ads accounts once their auth status resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load]);

  if (status === "loading") return null;

  if (status !== "authenticated") {
    return (
      <div className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2.5 text-sm text-navy-700">
          <Layers width={18} height={18} className="shrink-0 text-brand-600" />
          Přihlaste se Google účtem a připojte svůj Google Ads — jinak běží přehled na ukázkových datech.
        </p>
        <button
          type="button"
          onClick={() => signIn("google")}
          className="shrink-0 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Přihlásit přes Google
        </button>
      </div>
    );
  }

  const select = async (acc: AdsAccount) => {
    setBusy(acc.customerId);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: acc.customerId, customerName: acc.name }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Výběr účtu se nezdařil.");
        return;
      }
      setData((d) => (d ? { ...d, selected: acc.customerId } : d));
      onConnected?.();
    } catch {
      setError("Nepodařilo se spojit se serverem.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Layers width={17} height={17} className="text-brand-600" />
          Google Ads účet
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
        >
          <Refresh width={14} height={14} className={loading ? "animate-spin" : ""} />
          Načíst účty
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}

      {data?.configured === false && (
        <div className="mt-3 flex items-start gap-2 rounded-card bg-navy-50 px-4 py-3 text-sm text-muted">
          <Info width={16} height={16} className="mt-0.5 shrink-0" />
          Živá data z Google Ads vyžadují developer token (viz <code>SETUP.md</code>). Zatím se
          používají ukázková data.
        </div>
      )}

      {data?.configured &&
        (loading && !data.accounts?.length ? (
          <p className="mt-3 text-sm text-muted">Načítám účty…</p>
        ) : data.accounts && data.accounts.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {data.accounts.map((acc) => {
              const selected = data.selected === acc.customerId;
              return (
                <li key={acc.customerId}>
                  <button
                    type="button"
                    onClick={() => select(acc)}
                    disabled={busy === acc.customerId}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors disabled:opacity-60 ${
                      selected ? "border-brand-400 bg-brand-50" : "border-line hover:border-brand-300"
                    }`}
                  >
                    <span className="min-w-0 text-left">
                      <span className="block truncate font-medium text-navy-800">{acc.name}</span>
                      <span className="tnum text-xs text-muted">{acc.customerId}</span>
                    </span>
                    {selected && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700">
                        <Check width={14} height={14} />
                        Vybráno
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Tvůj Google účet nemá přístup k žádnému Google Ads účtu.
          </p>
        ))}
    </div>
  );
}
