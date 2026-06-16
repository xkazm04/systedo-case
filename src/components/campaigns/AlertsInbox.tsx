"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bell, Check } from "@/components/icons";
import { fmtRelative } from "@/lib/format";
import type { AlertRecord } from "@/lib/campaigns/alerts";

/** Bell + dropdown showing the tenant's alert inbox (newly-critical campaigns
 *  surfaced by a sync, scheduled or manual). Reloads when `refreshKey` changes.
 *  Renders nothing for anonymous visitors. */
export default function AlertsInbox({ refreshKey }: { refreshKey: number }) {
  const { status } = useSession();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) return;
      const json = (await res.json()) as { alerts?: AlertRecord[]; unread?: number };
      setAlerts(json.alerts ?? []);
      setUnread(json.unread ?? 0);
    } catch {
      /* non-critical chrome */
    }
  }, []);

  useEffect(() => {
    // Reload alerts when auth resolves or a sync may have minted new ones.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load, refreshKey]);

  const markAllRead = async () => {
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setAlerts((a) => a.map((x) => ({ ...x, read: true })));
      setUnread(0);
    } catch {
      /* ignore */
    }
  };

  if (status !== "authenticated") return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Upozornění${unread ? ` (${unread} nepřečtených)` : ""}`}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
      >
        <Bell width={16} height={16} />
        Upozornění
        {unread > 0 && (
          <span className="tnum grid h-5 min-w-5 place-items-center rounded-full bg-coral-500 px-1 text-[11px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-drop absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-card border border-line bg-surface p-3 shadow-pop">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="text-sm font-semibold text-navy-800">Upozornění</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
              >
                <Check width={13} height={13} />
                Označit přečtené
              </button>
            )}
          </div>

          {alerts.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted">
              Žádná upozornění. Při synchronizaci vás upozorníme na nově kritické kampaně.
            </p>
          ) : (
            <ul className="mt-2 max-h-80 space-y-1.5 overflow-y-auto">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-lg border px-3 py-2.5 text-sm ${
                    a.read ? "border-line" : "border-brand-200 bg-brand-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-navy-800">{a.title}</span>
                    {!a.read && (
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-coral-500" aria-hidden />
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{a.body}</p>
                  <time dateTime={a.createdAt} className="mt-1 block text-[11px] text-muted">
                    {fmtRelative(a.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
