"use client";

/** W3-B — one LIVE hosted experiment: its public address, its per-arm measured
 *  numbers, and the one action it offers (take it offline).
 *
 *  The numbers here are the SYNCED ones — the same `visitors`/`signups` the verdict
 *  table below the panel reads, because the cron writes the counter totals onto the
 *  experiment itself rather than into a second place. There is deliberately no
 *  "live counter" that could disagree with the verdict the operator is reading.
 *
 *  An arm with no `armId` was never served by us (a hand-typed arm on an experiment
 *  that was later published), so it reports "not measured" rather than a zero: a zero
 *  is a measurement, and this is the absence of one. */
import { Pill, buttonClass } from "@/components/ui";
import { Check } from "@/components/icons";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    live: "Živé",
    unpublish: "Vypnout stránku",
    countsHint: "konverze / zobrazení (měřeno)",
    notMeasured: "zatím neměřeno",
    liveNote: "Rozdělení běží. Čísla se aktualizují po každém běhu synchronizace.",
  },
  en: {
    live: "Live",
    unpublish: "Take offline",
    countsHint: "conversions / views (measured)",
    notMeasured: "not measured yet",
    liveNote: "The split is running. Numbers update after each sync run.",
  },
} as const;

export interface HostedLpArm {
  label: string;
  /** present only on an arm this product actually served */
  armId?: string;
  visitors: number;
  signups: number;
}

export default function HostedLpCard({
  cluster,
  slug,
  arms,
  busy,
  onUnpublish,
}: {
  cluster: string;
  slug: string;
  arms: HostedLpArm[];
  busy: boolean;
  onUnpublish: () => void;
}) {
  const t = useT(T);
  return (
    <div className="card border-positive/40 bg-positive/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Check width={15} height={15} className="text-positive" />
          {cluster}
          <Pill tone="positive">{t("live")}</Pill>
        </span>
        <a href={`/m/${slug}`} className="text-xs text-brand-accent hover:underline">
          /m/{slug}
        </a>
      </div>
      <ul className="mt-3 space-y-1">
        {arms.map((a) => (
          <li key={a.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-navy-700">{a.label}</span>
            <span className="tnum text-muted">
              {a.armId ? `${a.signups} / ${a.visitors} · ${t("countsHint")}` : t("notMeasured")}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{t("liveNote")}</p>
      <button
        type="button"
        disabled={busy}
        onClick={onUnpublish}
        className={`${buttonClass("ghost")} mt-3 text-xs`}
      >
        {t("unpublish")}
      </button>
    </div>
  );
}
