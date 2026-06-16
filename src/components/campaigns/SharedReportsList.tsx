"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Close, Copy, Link as LinkIcon } from "@/components/icons";
import { fmtDate } from "@/lib/format";

interface ShareRow {
  token: string;
  accountName: string;
  period: string;
  createdAt: string;
  expiresAt: string;
  views: number;
  expired: boolean;
  url: string;
}

/** Manage the client-share links the user has created: copy, see expiry + view
 *  count, and revoke. Reloads when `refreshSignal` changes (bumped after a new
 *  link is created). Renders nothing until at least one link exists. */
export default function SharedReportsList({ refreshSignal }: { refreshSignal: number }) {
  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns/share");
      if (!res.ok) return;
      const json = (await res.json()) as { reports?: ShareRow[] };
      setRows(json.reports ?? []);
    } catch {
      /* non-critical chrome */
    }
  }, []);

  useEffect(() => {
    // Reload the share list on mount and after a new link is created.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshSignal]);

  const revoke = async (token: string) => {
    setBusy(token);
    try {
      const res = await fetch("/api/campaigns/share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) setRows((r) => (r ?? []).filter((x) => x.token !== token));
    } finally {
      setBusy(null);
    }
  };

  const copy = (row: ShareRow) => {
    void navigator.clipboard?.writeText(row.url);
    setCopied(row.token);
    window.setTimeout(() => setCopied((c) => (c === row.token ? null : c)), 1500);
  };

  if (!rows || rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-card border border-line p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
        <LinkIcon width={15} height={15} className="text-brand-600" />
        Sdílené odkazy ({rows.length})
      </h3>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li
            key={row.token}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line px-3 py-2.5 text-sm"
          >
            <span className="min-w-0 flex-1">
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link-inline tnum break-all text-xs"
              >
                /report/{row.token.slice(0, 10)}…
              </a>
              <span className="mt-0.5 block text-xs text-muted">
                {row.expired ? (
                  <span className="text-negative">Vypršel</span>
                ) : (
                  <>platí do {fmtDate(row.expiresAt)}</>
                )}{" "}
                · {row.views}× zobrazeno
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => copy(row)}
                disabled={row.expired}
                className="inline-flex items-center gap-1 rounded-pill border border-line px-2.5 py-1 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-40"
              >
                {copied === row.token ? <Check width={13} height={13} /> : <Copy width={13} height={13} />}
                {copied === row.token ? "Zkopírováno" : "Kopírovat"}
              </button>
              <button
                type="button"
                onClick={() => revoke(row.token)}
                disabled={busy === row.token}
                aria-label="Zrušit odkaz"
                className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-coral-600 disabled:opacity-50"
              >
                <Close width={14} height={14} />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
