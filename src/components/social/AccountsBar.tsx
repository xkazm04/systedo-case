"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Check, Info, Share } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  type SocialAccount,
  type SocialPlatform,
} from "@/lib/social/types";

const T = {
  cs: {
    signInPrompt: "Přihlaste se a připojte sociální účty. I bez přihlášení si vyzkoušíte návrh, plánování i schránku.",
    signInBtn: "Přihlásit přes Google",
    connectedAccounts: "Připojené účty",
    demoMode: "Ukázkový režim (bez OAuth)",
  },
  en: {
    signInPrompt: "Sign in to connect your social accounts. You can still preview drafts, scheduling, and the inbox without signing in.",
    signInBtn: "Sign in with Google",
    connectedAccounts: "Connected accounts",
    demoMode: "Demo mode (no OAuth)",
  },
} as const;

export default function AccountsBar() {
  const { status } = useSession();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const t = useT(T);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/social/accounts");
      const json = (await res.json()) as { configured?: boolean; accounts?: SocialAccount[] };
      setConfigured(Boolean(json.configured));
      setAccounts(json.accounts ?? []);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load]);

  const toggle = async (platform: SocialPlatform, connected: boolean) => {
    setBusy(platform);
    try {
      const res = await fetch("/api/social/accounts", {
        method: connected ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const json = (await res.json()) as { accounts?: SocialAccount[] };
      if (res.ok) setAccounts(json.accounts ?? []);
    } finally {
      setBusy(null);
    }
  };

  if (status !== "authenticated") {
    return (
      <div className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2.5 text-sm text-navy-700">
          <Share width={18} height={18} className="shrink-0 text-brand-600" />
          {t("signInPrompt")}
        </p>
        <button
          type="button"
          onClick={() => signIn("google")}
          className="shrink-0 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          {t("signInBtn")}
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Share width={17} height={17} className="text-brand-600" />
          {t("connectedAccounts")}
        </h2>
        {!configured && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Info width={13} height={13} />
            {t("demoMode")}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SOCIAL_PLATFORMS.map((p) => {
          const connected = accounts.some((a) => a.platform === p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p, connected)}
              disabled={busy === p}
              className={`inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                connected ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line text-navy-700 hover:border-brand-300"
              }`}
            >
              {connected ? <Check width={14} height={14} /> : <span aria-hidden>＋</span>}
              {SOCIAL_PLATFORM_LABELS[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
