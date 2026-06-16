"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bolt } from "@/components/icons";
import type { UsageStatus } from "@/lib/plans";
import { UPGRADE_PATH } from "@/lib/plans";

/** Compact header chip showing the signed-in user's remaining daily AI quota,
 *  linking to the pricing page. Renders nothing for anonymous visitors (they're
 *  IP-rate-limited, not metered) so it never clutters the public case study.
 *  Surfaces the otherwise-invisible per-user plan limits + closes the upgrade
 *  dead-end the quota-exceeded messages point at. */
export default function UsageMeter() {
  const { status } = useSession();
  const [usage, setUsage] = useState<UsageStatus | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/usage");
        if (!res.ok) return;
        const json = (await res.json()) as UsageStatus;
        if (alive) setUsage(json);
      } catch {
        /* non-critical chrome — stay silent on failure */
      }
    })();
    return () => {
      alive = false;
    };
  }, [status]);

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
      title={`AI vyhodnocení dnes: ${used}/${limit} · plán ${usage.plan} · zbývá ${remaining}. Klikněte pro navýšení limitu.`}
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
