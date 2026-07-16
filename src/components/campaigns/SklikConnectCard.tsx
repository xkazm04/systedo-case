"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { Check, Close, Info } from "@/components/icons";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { useAuthedResource } from "./useAuthedResource";

const T = {
  cs: {
    heading: "Sklik (Seznam)",
    lead: "Připojte svůj Sklik API token a přehled kampaní poběží na živých datech účtu — stejně jako Google Ads. Token se ukládá šifrovaně a nikdy se nevrací do prohlížeče.",
    anonPrompt: "Přihlaste se a připojte svůj Sklik účet.",
    connected: "Připojeno",
    connectedNote: "Živá data Sklik účtu. Denní automatická synchronizace je aktivní.",
    tokenLabel: "Sklik API token",
    tokenPlaceholder: "Vložte API token ze Sklik účtu",
    connect: "Připojit",
    reconnect: "Změnit token",
    disconnect: "Odpojit",
    cancel: "Zrušit",
    tokenHint: "Token najdete ve Sklik účtu → Nastavení → API.",
    errFailed: "Akce se nezdařila.",
    errServer: "Nepodařilo se spojit se serverem.",
    errNoToken: "Zadejte API token.",
    errNoCrypto: "Server není nakonfigurován pro bezpečné uložení tokenu.",
  },
  en: {
    heading: "Sklik (Seznam)",
    lead: "Connect your Sklik API token and the campaigns dashboard runs on live account data — just like Google Ads. The token is stored encrypted and never returned to the browser.",
    anonPrompt: "Sign in to connect your Sklik account.",
    connected: "Connected",
    connectedNote: "Live Sklik account data. Daily automatic sync is on.",
    tokenLabel: "Sklik API token",
    tokenPlaceholder: "Paste the API token from your Sklik account",
    connect: "Connect",
    reconnect: "Change token",
    disconnect: "Disconnect",
    cancel: "Cancel",
    tokenHint: "Find the token in your Sklik account → Settings → API.",
    errFailed: "Action failed.",
    errServer: "Could not reach the server.",
    errNoToken: "Enter an API token.",
    errNoCrypto: "The server is not configured for secure token storage.",
  },
} as const;

interface SklikStatus {
  connected: boolean;
  connectedAt?: string;
}

/** Machine-code → localized message, so the bilingual copy lives client-side and the
 *  server never has to speak the user's language (the round-7 route convention). */
function messageForCode(code: string | undefined, t: (k: keyof typeof T.cs) => string): string {
  switch (code) {
    case "provider-no-token":
      return t("errNoToken");
    case "server-misconfigured":
      return t("errNoCrypto");
    default:
      return t("errFailed");
  }
}

/** Per-user Sklik connect row for the integrations surface: a token input + honest
 *  connected/disconnected status. Fetches its own status (the route resolves the
 *  caller server-side), so it needs no props. cs/en via useT, DS Button primitive. */
export default function SklikConnectCard() {
  const { status: authStatus } = useSession();
  const t = useT(T);
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (): Promise<SklikStatus | null | undefined> => {
    const res = await fetch("/api/campaigns/sklik");
    if (!res.ok) return undefined; // leave status as-is → the form still renders
    const json = (await res.json()) as { connection: SklikStatus };
    return json.connection;
  }, []);
  const { data: status, setData: setStatus } = useAuthedResource<SklikStatus | null>(fetchStatus, null);

  if (authStatus === "loading") return null;

  const connect = async () => {
    if (!token.trim()) {
      setError(t("errNoToken"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/sklik", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(messageForCode(json?.code, t));
        return;
      }
      setToken("");
      setEditing(false);
      setStatus(json.connection ?? { connected: true });
    } catch {
      setError(t("errServer"));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/sklik", { method: "DELETE" });
      if (!res.ok) {
        setError(t("errFailed"));
        return;
      }
      setStatus({ connected: false });
    } catch {
      setError(t("errServer"));
    } finally {
      setBusy(false);
    }
  };

  const connected = Boolean(status?.connected);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{t("heading")}</h3>
        {connected && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-positive-soft px-2.5 py-1 text-xs font-medium text-positive">
            <Check width={13} height={13} />
            {t("connected")}
          </span>
        )}
      </div>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{t("lead")}</p>

      {authStatus !== "authenticated" ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Info width={16} height={16} className="shrink-0" />
          {t("anonPrompt")}
        </p>
      ) : connected && !editing ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">{t("connectedNote")}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={busy}>
              {t("reconnect")}
            </Button>
            <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>
              <Close width={14} height={14} />
              {t("disconnect")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="sklik-token">
            {t("tokenLabel")}
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="sklik-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("tokenPlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand-400"
            />
            <Button variant="primary" size="sm" onClick={connect} disabled={busy}>
              {t("connect")}
            </Button>
            {connected && editing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setToken("");
                  setError(null);
                }}
                disabled={busy}
              >
                {t("cancel")}
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">{t("tokenHint")}</p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
    </div>
  );
}
