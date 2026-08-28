"use client";

/** The Kanály "quick win" callout — the one untracked low-effort/high-fit channel,
 *  offered as a single click into the setup wizard.
 *
 *  Extracted out of OrganicChannels (long-standing 200-LOC debt that may not grow)
 *  so the degraded guard could be added without growing it, mirroring
 *  ChannelNextSteps.
 *
 *  THE GUARD. `degraded` means the organic-channels store READ failed: the pinned
 *  plan and the tracked lifecycle may still exist, unread, so OrganicChannels'
 *  `saveTracks` refuses to write (a whole-state POST would clobber what it could
 *  not read). The table already disables every CTA whose action is local for
 *  exactly that reason (ChannelTable: `disabled={degraded && !next.to}`); this
 *  callout did not, so the most prominent affordance on the page opened a wizard
 *  whose Save silently did nothing (UAT 2026-08-28 kanaly-l1, finding K03).
 *  Disabled rather than hidden, on the table's precedent: WHICH channel is the
 *  quick win is still true and still worth reading — only the write is unsafe. */
import { ArrowRight, Bolt } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import type { OrganicChannel } from "@/lib/organic-channels/types";

const T = {
  cs: {
    quickWin: "Rychlá výhra",
    quickWinHint: "Nízká náročnost, vysoká vhodnost. Začněte tady.",
    quickWinDegraded: "Uložený stav se teď nedaří načíst, takže nastavení nelze uložit.",
  },
  en: {
    quickWin: "Quick win",
    quickWinHint: "Low effort, high fit. Start here.",
    quickWinDegraded: "Your saved state can't be read right now, so setup can't be saved.",
  },
} as const;

export default function ChannelQuickWin({
  channel,
  degraded,
  onStart,
}: {
  channel: OrganicChannel;
  /** saved state unreadable — writes are blocked, so the wizard would no-op */
  degraded: boolean;
  onStart: (channel: OrganicChannel) => void;
}) {
  const t = useT(T);
  return (
    <button
      type="button"
      onClick={() => onStart(channel)}
      disabled={degraded}
      className="group flex w-full items-center gap-3 rounded-card border border-positive/40 bg-positive-soft px-4 py-3 text-left transition-colors hover:border-positive disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-positive/40"
    >
      <Bolt width={18} height={18} className="shrink-0 text-positive" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-navy-800">
          {t("quickWin")}: {channel.name}
        </span>
        <span className="block truncate text-xs text-muted">
          {degraded ? t("quickWinDegraded") : t("quickWinHint")}
        </span>
      </span>
      <ArrowRight
        width={16}
        height={16}
        className="shrink-0 text-positive transition-transform group-hover:translate-x-1 group-disabled:translate-x-0"
      />
    </button>
  );
}
