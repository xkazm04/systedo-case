"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Clock, Refresh, Bolt, Bell, Document, Info, Download } from "@/components/icons";
import { fmtRelative, fmtDateTime } from "@/lib/format";
import { toCsv, downloadText } from "@/lib/export";
import type { ActivityKind, ActivityRecord } from "@/lib/campaigns/activity";

/** Clock + dropdown showing the tenant's activity timeline: applied budget moves,
 *  pauses, syncs and alerts. A read-only accountability feed an agency can export
 *  to CSV to show a client what changed. Reloads when `refreshKey` changes.
 *  Renders nothing for anonymous visitors. */
export default function ActivityFeed({ refreshKey }: { refreshKey: number }) {
  const { status } = useSession();
  const [items, setItems] = useState<ActivityRecord[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      if (!res.ok) return;
      const json = (await res.json()) as { activity?: ActivityRecord[] };
      setItems(json.activity ?? []);
    } catch {
      /* non-critical chrome */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load, refreshKey]);

  const exportCsv = () => {
    const rows = items.map((a) => [fmtDateTime(a.at), KIND_LABEL[a.kind], a.title, a.detail, a.actor ?? ""]);
    downloadText("systedo-aktivita.csv", toCsv(["Čas", "Typ", "Akce", "Detail", "Kdo"], rows));
  };

  if (status !== "authenticated") return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Historie aktivity"
        aria-expanded={open}
        className="relative inline-flex items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
      >
        <Clock width={16} height={16} />
        <span className="hidden sm:inline">Historie</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-card border border-line bg-surface p-2 shadow-pop sm:w-96">
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            <span className="text-sm font-semibold text-navy-800">Historie aktivity</span>
            {items.length > 0 && (
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
              >
                <Download width={13} height={13} />
                Export CSV
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted">
              Zatím žádná aktivita. Přesuny rozpočtu, synchronizace a upozornění se zde objeví.
            </p>
          ) : (
            <ul className="mt-1 max-h-96 space-y-1.5 overflow-y-auto">
              {items.map((a) => {
                const Icon = KIND_ICON[a.kind];
                return (
                  <li key={a.id} className="rounded-lg border border-line px-3 py-2.5 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-accent">
                        <Icon width={13} height={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-navy-800">{a.title}</p>
                        <p className="mt-0.5 text-xs text-muted">{a.detail}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
                          <time dateTime={a.at} title={fmtDateTime(a.at)}>
                            {fmtRelative(a.at)}
                          </time>
                          {a.actor && <span aria-hidden>·</span>}
                          {a.actor && <span>{a.actor}</span>}
                        </div>
                      </div>
                    </div>
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

const KIND_LABEL: Record<ActivityKind, string> = {
  budget_shift: "Přesun rozpočtu",
  pause: "Pozastavení",
  sync: "Synchronizace",
  alert: "Upozornění",
  report: "Report",
};

const KIND_ICON: Record<ActivityKind, typeof Clock> = {
  budget_shift: Bolt,
  pause: Info,
  sync: Refresh,
  alert: Bell,
  report: Document,
};
