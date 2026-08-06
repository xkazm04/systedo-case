"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bolt } from "@/components/icons";
import type { UsageStatus } from "@/lib/plans";
import { UPGRADE_PATH } from "@/lib/plans";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    tooltip: "AI vyhodnocení dnes: {used}/{limit} · plán {plan} · zbývá {remaining}. Vyberte pro navýšení limitu.",
  },
  en: {
    tooltip: "AI evaluations today: {used}/{limit} · plan {plan} · {remaining} left. Select to raise the limit.",
  },
} as const;

/** Compact header chip showing the signed-in user's remaining daily AI quota,
 *  linking to the pricing page. Renders nothing for anonymous visitors (they're
 *  IP-rate-limited, not metered) so it never clutters the public case study.
 *  Surfaces the otherwise-invisible per-user plan limits + closes the upgrade
 *  dead-end the quota-exceeded messages point at. */
export default function UsageMeter() {
  const { status } = useSession();
  const t = useT(T);
  const pathname = usePathname();
  const [usage, setUsage] = useState<UsageStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (!res.ok) return;
      setUsage((await res.json()) as UsageStatus);
    } catch {
      /* non-critical chrome — stay silent on failure */
    }
  }, []);

  // Initial fetch + refetch on client-side route change (the chrome persists
  // across navigations, so a fresh page's quota would otherwise never load).
  useEffect(() => {
    if (status !== "authenticated") return;
    void (async () => {
      await refresh();
    })();
  }, [status, pathname, refresh]);

  // Revalidate when the user returns to the tab, and whenever an AI action
  // reports it spent quota. AI-eval call sites can dispatch
  // `window.dispatchEvent(new Event("usage:changed"))` after a run so the chip
  // reflects the new remaining count without a full navigation.
  useEffect(() => {
    if (status !== "authenticated") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onChanged = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onChanged);
    window.addEventListener("usage:changed", onChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onChanged);
      window.removeEventListener("usage:changed", onChanged);
    };
  }, [status, refresh]);

  if (status !== "authenticated" || !usage) return null;

  const used = usage.used.aiEval;
  const limit = usage.limits.aiEval;
  const remaining = Math.max(0, limit - used);
  const ratio = limit > 0 ? used / limit : 0;
  // Warn as the day's budget runs low; the bar mirrors the same thresholds.
  const low = remaining === 0 ? "out" : ratio >= 0.8 ? "low" : "ok";
  const barColor =
    low === "out" ? "bg-negative" : low === "low" ? "bg-coral-500" : "bg-brand-500";

  return (
    <Link
      href={UPGRADE_PATH}
      title={t("tooltip", { used, limit, plan: usage.plan, remaining })}
      className="hidden items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent lg:inline-flex"
    >
      <Bolt width={13} height={13} className="text-brand-600" />
      <span className="tnum">
        AI {used}/{limit}
      </span>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-navy-50" aria-hidden>
        <span
          className={`block h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
        />
      </span>
    </Link>
  );
}
