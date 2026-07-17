"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Bell, Bolt, Check } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useOptionalProject } from "@/lib/projects/context";
import type { AlertRecord } from "@/lib/campaigns/alerts";
import {
  groupAlertRecords,
  alertStatus,
  alertCampaignIds,
  isAlertActionable,
} from "@/lib/campaigns/alert-suppression";
import { useAuthedResource } from "./useAuthedResource";
import { useDismiss } from "./useDismiss";
import PillButton from "./PillButton";

/** The inbox payload: the alert list + the server's unread count, loaded together
 *  so the badge and the list can never disagree. */
interface Inbox {
  alerts: AlertRecord[];
  unread: number;
}
import { THREAD_ANCHORS } from "./thread";

const T = {
  cs: {
    ariaLabel: "Upozornění",
    ariaLabelUnread: "Upozornění ({n} nepřečtených)",
    buttonLabel: "Upozornění",
    heading: "Upozornění",
    markRead: "Označit přečtené",
    repeat: "×{n}",
    open: "Otevřít",
    empty: "Žádná upozornění. Při synchronizaci vás upozorníme na nově kritické kampaně.",
    stage: "Připravit balíček",
    staging: "Připravuji…",
    acknowledge: "Vzít na vědomí",
    statusAck: "Vzato na vědomí",
    statusResolved: "Vyřešeno",
    actionErr: "Akci se nepodařilo dokončit.",
    serverErr: "Nepodařilo se spojit se serverem.",
  },
  en: {
    ariaLabel: "Alerts",
    ariaLabelUnread: "Alerts ({n} unread)",
    buttonLabel: "Alerts",
    heading: "Alerts",
    markRead: "Mark all read",
    repeat: "×{n}",
    open: "Open",
    empty: "No alerts. We'll notify you when newly critical campaigns are found during a sync.",
    stage: "Stage change-set",
    staging: "Staging…",
    acknowledge: "Acknowledge",
    statusAck: "Acknowledged",
    statusResolved: "Resolved",
    actionErr: "The action could not be completed.",
    serverErr: "Could not reach the server.",
  },
} as const;

/** Bell + dropdown showing the tenant's alert inbox (newly-critical campaigns
 *  surfaced by a sync, scheduled or manual). Reloads when `refreshKey` changes.
 *  Critical alerts carry one-click workflow actions: stage a pre-scoped change-set
 *  (closing the loop into the control plane) or acknowledge. Renders nothing for
 *  anonymous visitors. */
export default function AlertsInbox({
  refreshKey,
  onStaged,
  onAlertsChange,
}: {
  refreshKey: number;
  /** called after a change-set is staged from an alert, so the parent can reload
   *  the control plane to surface the new pending proposal. */
  onStaged?: () => void;
  /** report the loaded alert list up to the parent (Direction 2): this component
   *  is the SINGLE /api/alerts owner, so CampaignsClient derives its
   *  campaign→alert map from this instead of fetching the endpoint a second time.
   *  Pass a stable (useState setter / useCallback) reference. */
  onAlertsChange?: (alerts: AlertRecord[]) => void;
}) {
  const { status } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const fmt = useFormatters();
  const t = useT(T);

  // Reload alerts when auth resolves or a sync may have minted new ones
  // (refreshKey). This is the SINGLE /api/alerts owner on the page.
  const fetchInbox = useCallback(async (): Promise<Inbox | undefined> => {
    const res = await fetch(pid ? `/api/alerts?projectId=${encodeURIComponent(pid)}` : "/api/alerts");
    if (!res.ok) return undefined;
    const json = (await res.json()) as { alerts?: AlertRecord[]; unread?: number };
    return { alerts: json.alerts ?? [], unread: json.unread ?? 0 };
  }, [pid]);
  const { data: inbox, setData: setInbox, reload: load } = useAuthedResource<Inbox>(
    fetchInbox,
    { alerts: [], unread: 0 },
    refreshKey
  );
  const { alerts, unread } = inbox;

  // Hand the loaded alerts to the parent so it can derive its campaign→alert map
  // without a duplicate fetch. Fires only when the list identity changes (a load
  // or an optimistic mark-read), not on unrelated re-renders.
  useEffect(() => {
    onAlertsChange?.(alerts);
  }, [alerts, onAlertsChange]);

  const markAllRead = async () => {
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "readAll", projectId: pid }),
      });
      // A resolved fetch is not an HTTP success — a 401/403/500 would otherwise clear
      // the unread badge and mark every alert read while the server persisted nothing,
      // so the operator believes critical-campaign alerts were acknowledged.
      if (!res.ok) return;
      setInbox((d) => ({ alerts: d.alerts.map((x) => ({ ...x, read: true })), unread: 0 }));
    } catch {
      /* ignore */
    }
  };

  /** Stage a pending change-set pre-scoped to this alert's campaigns and link it
   *  back to the alert. Human click is the only mutation trigger — this only
   *  *creates* a pending proposal; applying it stays a separate, explicit step. */
  const stage = async (alertId: string) => {
    setActingId(alertId);
    setActionErr(null);
    try {
      const res = await fetch("/api/campaigns/control-plane", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", alertId, projectId: pid }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setActionErr(json?.error ?? t("actionErr"));
        return;
      }
      await load();
      onStaged?.();
    } catch {
      setActionErr(t("serverErr"));
    } finally {
      setActingId(null);
    }
  };

  const acknowledge = async (alertId: string) => {
    setActingId(alertId);
    setActionErr(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge", id: alertId, projectId: pid }),
      });
      if (!res.ok) {
        setActionErr(t("actionErr"));
        return;
      }
      await load();
    } catch {
      setActionErr(t("serverErr"));
    } finally {
      setActingId(null);
    }
  };

  if (status !== "authenticated") return null;

  return (
    <div className="relative rounded-pill" id={THREAD_ANCHORS.alertsInbox} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? t("ariaLabelUnread", { n: unread }) : t("ariaLabel")}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
      >
        <Bell width={16} height={16} />
        {t("buttonLabel")}
        {unread > 0 && (
          <span className="tnum grid h-5 min-w-5 place-items-center rounded-full bg-coral-500 px-1 text-[13px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-drop absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-card border border-line bg-surface p-3 shadow-pop">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="text-sm font-semibold text-navy-800">{t("heading")}</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
              >
                <Check width={13} height={13} />
                {t("markRead")}
              </button>
            )}
          </div>

          {actionErr && <p className="mt-2 px-1 text-xs text-negative">{actionErr}</p>}

          {alerts.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted">{t("empty")}</p>
          ) : (
            <ul className="mt-2 max-h-80 space-y-1.5 overflow-y-auto">
              {/* Collapse repeat alerts about the same campaign(s) into one row with
                  a ×N count, so a flickering campaign doesn't flood the inbox. */}
              {groupAlertRecords(alerts).map((g) => {
                const a = g.latest;
                const unread = g.unread > 0;
                const st = alertStatus(a);
                // A change-set can be staged from any critical alert that names
                // campaigns and isn't already resolved; acknowledge is offered
                // while the alert is still fresh (isAlertActionable = critical +
                // new + has campaigns).
                const canStage =
                  a.type === "critical" && st !== "resolved" && alertCampaignIds(a).length > 0;
                const canAck = isAlertActionable(a);
                const acting = actingId === a.id;
                return (
                  <li
                    key={a.id}
                    className={`rounded-lg border px-3 py-2.5 text-sm ${
                      unread ? "border-brand-200 bg-brand-50" : "border-line"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium text-navy-800">
                        {a.title}
                        {g.count > 1 && (
                          <span className="tnum rounded-full bg-navy-100 px-1.5 text-[13px] font-semibold text-muted">
                            {t("repeat", { n: g.count })}
                          </span>
                        )}
                      </span>
                      {unread && (
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-coral-500" aria-hidden />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{a.body}</p>
<div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <time dateTime={a.createdAt} className="text-[13px] text-muted">
                        {fmt.fmtRelative(a.createdAt)}
                      </time>
                      {st === "resolved" && (
                        <span className="pill bg-positive-soft text-positive">
                          {t("statusResolved")}
                        </span>
                      )}
                      {st === "acknowledged" && (
                        <span className="pill bg-navy-50 text-muted">{t("statusAck")}</span>
                      )}
                    </div>
                    {a.href && (
                      <Link
                        href={a.href}
                        onClick={() => setOpen(false)}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
                      >
                        {t("open")}
                        <ArrowRight width={12} height={12} />
                      </Link>
                    )}
                    {(canStage || canAck) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {canStage && (
                          <PillButton size="micro" onClick={() => stage(a.id)} disabled={acting}>
                            <Bolt width={12} height={12} />
                            {acting ? t("staging") : t("stage")}
                          </PillButton>
                        )}
                        {canAck && (
                          <button
                            type="button"
                            onClick={() => acknowledge(a.id)}
                            disabled={acting}
                            className="inline-flex items-center gap-1 rounded-pill border border-line px-3 py-1 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-60"
                          >
                            <Check width={12} height={12} />
                            {t("acknowledge")}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
