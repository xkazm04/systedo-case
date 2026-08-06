"use client";

import { useState } from "react";
import { ChevronDown, Info, Refresh } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { CAMPAIGN_PERIODS, campaignPeriodLabel, type CampaignPeriod } from "@/lib/campaigns/types";
import { isForeignCurrency, normalizeCurrency } from "@/lib/campaigns/currency";
import type { CampaignsMeta } from "./useCampaigns";
import { useDismiss } from "./useDismiss";

const T = {
  cs: {
    trigger: "Původ dat",
    heading: "Původ zobrazených dat",
    sourceLabel: "Zdroj",
    lastSync: "Poslední synchronizace",
    degradedTitle: "Zobrazují se ukázková data",
    degradedBody:
      "Poslední živá synchronizace selhala, proto přehled dočasně ukazuje ukázková data. Zkuste synchronizovat znovu, případně obnovte připojení účtu.",
    degradedReasonLabel: "Důvod (diagnostika)",
    coverageHeading: "Pokrytí období",
    coverageNote: "Každé období se ukládá zvlášť. Přepnutí zobrazí uloženou verzi bez nové synchronizace.",
    shown: "zobrazeno",
    stale: "zastaralé",
    neverSynced: "nesynchronizováno",
    live: "živá data",
    sample: "ukázková data",
    currencyLabel: "Měna účtu",
    currencyNote:
      "Účet je veden v měně {currency}. Částky zobrazujeme v této měně bez přepočtu na Kč.",
    halereTitle: "Podezření na haléře",
    halereBody:
      "Náklady účtu Sklik jsou vůči dennímu rozpočtu ~100× vyšší, než je pravděpodobné. Data mohou být v haléřích. Nic zatím nepřepočítáváme. Potvrzením se všechny další synchronizace budou dělit 100 (haléře → Kč).",
    halereConfirm: "Potvrdit haléře (dělit 100)",
    halereConfirming: "Potvrzuji…",
    halereConfirmed: "Potvrzeno. Přepočet se použije od příští synchronizace.",
    halereError: "Potvrzení se nezdařilo.",
  },
  en: {
    trigger: "Data source",
    heading: "Provenance of the data on screen",
    sourceLabel: "Source",
    lastSync: "Last sync",
    degradedTitle: "Showing sample data",
    degradedBody:
      "The last live sync failed, so the dashboard is temporarily showing sample data. Try syncing again, or reconnect the account.",
    degradedReasonLabel: "Reason (diagnostics)",
    coverageHeading: "Period coverage",
    coverageNote: "Each period is stored separately. Switching serves the stored version with no fresh sync.",
    shown: "shown",
    stale: "stale",
    neverSynced: "not synced",
    live: "live data",
    sample: "sample data",
    currencyLabel: "Account currency",
    currencyNote:
      "This account is billed in {currency}. Amounts are shown in that currency, not converted to CZK.",
    halereTitle: "Haléře suspected",
    halereBody:
      "This Sklik account's costs run ~100× higher than its daily budget makes plausible. The data may be in haléře. Nothing is converted yet. Confirming divides every future sync by 100 (haléře → CZK).",
    halereConfirm: "Confirm haléře (divide by 100)",
    halereConfirming: "Confirming…",
    halereConfirmed: "Confirmed. The conversion applies from the next sync.",
    halereError: "Confirmation failed.",
  },
} as const;

/** A period's stored state is "stale" when its last sync is older than this — a
 *  gentle nudge that the warm data behind the toggle is a day+ old. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

type PeriodStatus = "shown" | "fresh" | "stale" | "cold";

/** Classify one period's stored coverage relative to now (pure). `cold` = never
 *  synced; `shown` = the period currently on screen; `stale` = synced but older
 *  than STALE_AFTER_MS; `fresh` otherwise. */
function classifyPeriod(
  period: CampaignPeriod,
  active: CampaignPeriod,
  syncedByPeriod: Record<string, string> | undefined,
  nowMs: number
): { status: PeriodStatus; syncedAt: string | null } {
  const syncedAt = syncedByPeriod?.[period] ?? null;
  if (!syncedAt) return { status: "cold", syncedAt: null };
  if (period === active) return { status: "shown", syncedAt };
  const age = nowMs - new Date(syncedAt).getTime();
  return { status: age > STALE_AFTER_MS ? "stale" : "fresh", syncedAt };
}

/**
 * Data-provenance disclosure reachable from the source chip. Answers "why am I
 * looking at these numbers?" in one click: the live/sample source, last good sync
 * age, the per-period coverage (with stale periods flagged), and — when the last
 * live fetch degraded to sample — a human Czech explanation plus the stored
 * diagnostic reason. Reads only fields already present in SyncMeta, so it triggers
 * NO new fetch. Uses the dark-mode-aware semantic tokens throughout.
 */
export default function SyncProvenance({
  meta,
  period,
  sourceLabel,
}: {
  meta: CampaignsMeta;
  period: CampaignPeriod;
  sourceLabel: string;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  // Captured when the popover opens (event handlers may read the clock; render may
  // not) — the reference "now" the per-period stale classification compares against.
  const [nowMs, setNowMs] = useState(0);
  // Direction 3: the haléře-confirm affordance's local state (optimistic — the ÷100
  // takes effect from the next sync, so we confirm the intent here and let the note
  // clear itself on the next sync's fresh verdict).
  const [halereConfirming, setHalereConfirming] = useState(false);
  const [halereDone, setHalereDone] = useState(false);
  const [halereError, setHalereError] = useState(false);
  // Dismiss on outside click / Escape — the shared lightweight popover contract.
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  const confirmHalere = async () => {
    setHalereConfirming(true);
    setHalereError(false);
    try {
      const res = await fetch("/api/campaigns/sklik", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ halereConfirmed: true }),
      });
      if (!res.ok) {
        setHalereError(true);
        return;
      }
      setHalereDone(true);
    } catch {
      setHalereError(true);
    } finally {
      setHalereConfirming(false);
    }
  };

  const toggle = () => {
    setNowMs(Date.now());
    setOpen((v) => !v);
  };

  const degraded = Boolean(meta.degraded);
  const isLive = !degraded && meta.source !== "sample";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={t("trigger")}
        className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs transition-colors ${
          degraded
            ? "border-coral-400/40 bg-coral-soft text-coral-600 hover:border-coral-400"
            : "border-line bg-surface text-muted hover:border-brand-300 hover:text-brand-accent"
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${
            degraded ? "bg-coral-500" : isLive ? "bg-positive" : "bg-muted"
          }`}
        />
        {sourceLabel}
        <span aria-hidden>·</span>
        <time dateTime={meta.syncedAt} title={fmt.fmtDateTime(meta.syncedAt)}>
          {fmt.fmtRelative(meta.syncedAt)}
        </time>
        <ChevronDown width={12} height={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-80 rounded-card border border-line bg-surface p-3 text-sm shadow-pop">
          <div className="flex items-center gap-1.5 px-1 pb-2 text-ink">
            <Info width={14} height={14} className="text-brand-accent" />
            <span className="font-semibold">{t("heading")}</span>
          </div>

          {/* source + last good sync */}
          <dl className="space-y-1.5 rounded-lg border border-line px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t("sourceLabel")}</dt>
              <dd className="flex items-center gap-1.5 font-medium text-ink">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-positive" : "bg-muted"}`}
                />
                {sourceLabel}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t("lastSync")}</dt>
              <dd className="font-medium text-ink">
                <time dateTime={meta.syncedAt} title={fmt.fmtDateTime(meta.syncedAt)}>
                  {fmt.fmtRelative(meta.syncedAt)}
                </time>
              </dd>
            </div>
          </dl>

          {/* account currency (Direction 2): only flagged when it is a captured,
              non-CZK code — CZK / unknown accounts add no note (nothing changed). */}
          {isForeignCurrency(meta.currency) && (
            <div className="mt-2 rounded-lg border border-line bg-canvas/60 px-3 py-2">
              <p className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted">{t("currencyLabel")}</span>
                <span className="font-semibold text-ink">{normalizeCurrency(meta.currency)}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {t("currencyNote", { currency: normalizeCurrency(meta.currency) ?? "" })}
              </p>
            </div>
          )}

          {/* Direction 3 — suspected haléře: an honest flag + one-click confirm that
              flips the ÷100 conversion GOING FORWARD (never a silent conversion). */}
          {meta.moneyVerdict === "halere-suspected" && (
            <div className="mt-2 rounded-lg border border-coral-400/40 bg-coral-soft px-3 py-2">
              <p className="font-medium text-coral-600">{t("halereTitle")}</p>
              {halereDone ? (
                <p className="mt-1 text-xs text-positive">{t("halereConfirmed")}</p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted">{t("halereBody")}</p>
                  <button
                    type="button"
                    onClick={confirmHalere}
                    disabled={halereConfirming}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-coral-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-coral-600 disabled:opacity-60"
                  >
                    {halereConfirming ? t("halereConfirming") : t("halereConfirm")}
                  </button>
                  {halereError && <p className="mt-1.5 text-[11px] text-negative">{t("halereError")}</p>}
                </>
              )}
            </div>
          )}

          {/* degradation: human Czech explanation + stored diagnostic reason */}
          {degraded && (
            <div className="mt-2 rounded-lg border border-coral-400/40 bg-coral-soft px-3 py-2">
              <p className="font-medium text-coral-600">{t("degradedTitle")}</p>
              <p className="mt-1 text-xs text-muted">{t("degradedBody")}</p>
              {meta.degradedReason && (
                <p className="mt-1.5 text-[11px] text-muted">
                  <span className="font-medium">{t("degradedReasonLabel")}:</span>{" "}
                  <span className="tnum break-words font-mono">{meta.degradedReason}</span>
                </p>
              )}
            </div>
          )}

          {/* per-period coverage with stale distinction */}
          <div className="mt-2">
            <p className="px-1 text-xs font-semibold text-ink">{t("coverageHeading")}</p>
            <ul className="mt-1 space-y-1">
              {CAMPAIGN_PERIODS.map((p) => {
                const { status, syncedAt } = classifyPeriod(p, period, meta.syncedByPeriod, nowMs);
                return (
                  <li
                    key={p}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-1.5"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-ink">
                      {status === "shown" && <Refresh width={12} height={12} className="text-brand-accent" />}
                      {campaignPeriodLabel(p, locale)}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs">
                      {syncedAt ? (
                        <time
                          dateTime={syncedAt}
                          title={fmt.fmtDateTime(syncedAt)}
                          className={status === "stale" ? "text-coral-600" : "text-muted"}
                        >
                          {fmt.fmtRelative(syncedAt)}
                        </time>
                      ) : (
                        <span className="text-muted">{t("neverSynced")}</span>
                      )}
                      {status === "shown" && (
                        <span className="rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-accent">
                          {t("shown")}
                        </span>
                      )}
                      {status === "stale" && (
                        <span className="rounded-pill bg-coral-soft px-2 py-0.5 text-[11px] font-medium text-coral-600">
                          {t("stale")}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 px-1 text-[11px] text-muted">{t("coverageNote")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
