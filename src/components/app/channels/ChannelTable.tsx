"use client";

/** The signpost table: fit + mode + stage + the ONE derived next step per
 *  channel. Rows open the playbook; the trailing button performs the next step
 *  (the parent owns both handlers and the derivation). */
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { ArrowRight } from "@/components/icons";
import type { ChannelTrack, OrganicChannel } from "@/lib/organic-channels/types";
import type { ChannelNext } from "@/lib/organic-channels/next-step";
import { CATEGORY_LABELS, EFFORT_LABELS, MODE_LABELS, NEXT_LABELS, STAGE_LABELS } from "./labels";
import { interactiveRowProps } from "@/lib/a11y/rowActivation";

const T = {
  cs: {
    colChannel: "Kanál",
    colFit: "Vhodnost",
    colMode: "Režim",
    colStage: "Stav",
    colNext: "Další krok",
  },
  en: {
    colChannel: "Channel",
    colFit: "Fit",
    colMode: "Mode",
    colStage: "Status",
    colNext: "Next step",
  },
} as const;

export default function ChannelTable({
  channels,
  tracks,
  nextOf,
  degraded,
  onOpen,
  onNext,
}: {
  channels: OrganicChannel[];
  tracks: Record<string, ChannelTrack>;
  /** the derived next step per channel (availability-gated by the parent) */
  nextOf: (c: OrganicChannel) => ChannelNext;
  /** saved state unreadable — local-action CTAs disable (writes are blocked) */
  degraded: boolean;
  onOpen: (id: string) => void;
  onNext: (c: OrganicChannel) => void;
}) {
  const t = useT(T);
  const { locale } = useLocale();
  const L = locale === "en" ? "en" : "cs";

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="px-4 py-3">{t("colChannel")}</th>
            <th className="hidden px-4 py-3 sm:table-cell">{t("colFit")}</th>
            <th className="hidden px-4 py-3 md:table-cell">{t("colMode")}</th>
            <th className="px-4 py-3">{t("colStage")}</th>
            <th className="px-4 py-3 text-right">{t("colNext")}</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => {
            const track = tracks[c.id];
            const stage = track?.stage ?? "identified";
            const next = nextOf(c);
            return (
              <tr
                key={c.id}
                {...interactiveRowProps(() => onOpen(c.id), c.name)}
                className="cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-navy-800">{c.name}</span>
                    <span className="hidden pill bg-navy-50 text-muted lg:inline-flex">
                      {CATEGORY_LABELS[c.category][L]}
                    </span>
                  </div>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-navy-50" aria-hidden>
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${c.fit}%` }} />
                    </span>
                    <span className="tnum text-xs font-semibold text-navy-800">{c.fit}</span>
                  </span>
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {track?.mode ? (
                    <span className={`pill ${MODE_LABELS[track.mode].tone}`}>{MODE_LABELS[track.mode][L]}</span>
                  ) : (
                    <span className={`pill ${EFFORT_LABELS[c.effort].tone}`}>{EFFORT_LABELS[c.effort][L]}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`pill ${STAGE_LABELS[stage].tone}`}>{STAGE_LABELS[stage][L]}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {next.key !== "none" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNext(c);
                      }}
                      disabled={degraded && !next.to}
                      className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {NEXT_LABELS[next.key][L]}
                      {next.count ? <span className="pill bg-brand-50 text-brand-700">{next.count}</span> : null}
                      <ArrowRight width={12} height={12} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
