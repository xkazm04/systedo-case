"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Check, Close, Info, Layers, Refresh } from "@/components/icons";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    anonPrompt:
      "Přihlaste se Google účtem a připojte svůj Google Ads — jinak běží přehled na ukázkových datech.",
    signIn: "Přihlásit přes Google",
    heading: "Google Ads účty",
    refresh: "Načíst",
    noTokenNote: "Připojení živých Google Ads účtů vyžaduje developer token (viz SETUP.md). Zatím se používají ukázková data.",
    addAccount: "Přidat další účet",
    connectAccount: "Připojit účet",
    loading: "Načítám dostupné účty…",
    allConnected: "Všechny dostupné účty jsou připojené.",
    noAccess: "Tvůj Google účet nemá přístup k žádnému Google Ads účtu.",
    active: "Aktivní",
    activate: "Aktivovat",
    disconnectLabel: "Odpojit účet",
    connect: "Připojit",
    errorFailed: "Akce se nezdařila.",
    errorServer: "Nepodařilo se spojit se serverem.",
  },
  en: {
    anonPrompt:
      "Sign in with your Google account and connect your Google Ads — otherwise the dashboard runs on sample data.",
    signIn: "Sign in with Google",
    heading: "Google Ads accounts",
    refresh: "Refresh",
    noTokenNote: "Connecting live Google Ads accounts requires a developer token (see SETUP.md). Sample data is used for now.",
    addAccount: "Add another account",
    connectAccount: "Connect account",
    loading: "Loading available accounts…",
    allConnected: "All available accounts are already connected.",
    noAccess: "Your Google account does not have access to any Google Ads account.",
    active: "Active",
    activate: "Activate",
    disconnectLabel: "Disconnect account",
    connect: "Connect",
    errorFailed: "Action failed.",
    errorServer: "Could not reach the server.",
  },
} as const;

interface AdsAccount {
  customerId: string;
  name: string;
}
interface ConnectedAccount {
  customerId: string;
  customerName: string;
}
interface AccountsResponse {
  configured?: boolean;
  accounts?: AdsAccount[];
  connected?: ConnectedAccount[];
  active?: string | null;
  error?: string;
}

/** Connect & switch Google Ads accounts (multi-account / MCC). Sign in with
 *  Google, connect one or more accounts the user can access, switch the active
 *  one (drives the sync), or disconnect. Switching / connecting triggers a
 *  re-sync. Explains the gating when no developer token is configured. */
export default function AdsAccountPicker({ onConnected }: { onConnected?: () => void }) {
  const { status } = useSession();
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT(T);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/accounts");
      const json = (await res.json()) as AccountsResponse;
      setData(json);
      if (!res.ok && json.error) setError(json.error);
    } catch {
      setError(t("errorServer"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // Load the user's accounts once their auth status resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load]);

  if (status === "loading") return null;

  if (status !== "authenticated") {
    return (
      <div className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2.5 text-sm text-navy-700">
          <Layers width={18} height={18} className="shrink-0 text-brand-600" />
          {t("anonPrompt")}
        </p>
        <button
          type="button"
          onClick={() => signIn("google")}
          className="shrink-0 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          {t("signIn")}
        </button>
      </div>
    );
  }

  const act = async (fn: () => Promise<Response>, key: string, after?: () => void) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? t("errorFailed"));
        return;
      }
      after?.();
    } catch {
      setError(t("errorServer"));
    } finally {
      setBusy(null);
    }
  };

  const connect = (acc: AdsAccount) =>
    act(
      () =>
        fetch("/api/campaigns/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: acc.customerId, customerName: acc.name }),
        }),
      acc.customerId,
      () => {
        void load();
        onConnected?.();
      }
    );

  const activate = (customerId: string) =>
    act(
      () =>
        fetch("/api/campaigns/accounts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId }),
        }),
      customerId,
      () => {
        setData((d) => (d ? { ...d, active: customerId } : d));
        onConnected?.();
      }
    );

  const disconnect = (customerId: string) =>
    act(
      () =>
        fetch("/api/campaigns/accounts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId }),
        }),
      customerId,
      () => void load()
    );

  const connected = data?.connected ?? [];
  const connectedIds = new Set(connected.map((c) => c.customerId));
  const connectable = (data?.accounts ?? []).filter((a) => !connectedIds.has(a.customerId));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Layers width={17} height={17} className="text-brand-600" />
          {t("heading")}
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
        >
          <Refresh width={14} height={14} className={loading ? "animate-spin" : ""} />
          {t("refresh")}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}

      {/* connected accounts */}
      {connected.length > 0 && (
        <ul className="mt-3 space-y-2">
          {connected.map((acc) => {
            const active = data?.active === acc.customerId;
            return (
              <li
                key={acc.customerId}
                className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
                  active ? "border-brand-400 bg-brand-50" : "border-line"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-navy-800">{acc.customerName}</span>
                  <span className="tnum text-xs text-muted">{acc.customerId}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {active ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                      <Check width={14} height={14} />
                      {t("active")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => activate(acc.customerId)}
                      disabled={busy === acc.customerId}
                      className="rounded-pill border border-line px-3 py-1 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
                    >
                      {t("activate")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => disconnect(acc.customerId)}
                    disabled={busy === acc.customerId}
                    aria-label={t("disconnectLabel")}
                    className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-coral-600 disabled:opacity-50"
                  >
                    <Close width={14} height={14} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {data?.configured === false ? (
        <div className="mt-3 flex items-start gap-2 rounded-card bg-navy-50 px-4 py-3 text-sm text-muted">
          <Info width={16} height={16} className="mt-0.5 shrink-0" />
          {t("noTokenNote")}
        </div>
      ) : (
        data?.configured && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {connected.length ? t("addAccount") : t("connectAccount")}
            </p>
            {loading && !data.accounts?.length ? (
              <p className="mt-2 text-sm text-muted">{t("loading")}</p>
            ) : connectable.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {connectable.map((acc) => (
                  <li key={acc.customerId}>
                    <button
                      type="button"
                      onClick={() => connect(acc)}
                      disabled={busy === acc.customerId}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-sm transition-colors hover:border-brand-300 disabled:opacity-60"
                    >
                      <span className="min-w-0 text-left">
                        <span className="block truncate font-medium text-navy-800">{acc.name}</span>
                        <span className="tnum text-xs text-muted">{acc.customerId}</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-brand-accent">{t("connect")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {connected.length ? t("allConnected") : t("noAccess")}
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}
