"use client";

/** The Kanály module's three HONESTY banners, extracted from OrganicChannels so the
 *  signpost module is about the signpost again (AGENTS.md's 200-LOC rule — the
 *  module was 547 lines and this is the block with its own copy and no shared state).
 *
 *  All three exist for the same reason and are deliberately kept together: each one
 *  is the module refusing to let the screen imply something that is not true.
 *   • `degraded` — the saved plan could not be READ, so the sample on screen is a
 *     stand-in and every status write is disabled rather than allowed to clobber it.
 *   • `saveFailed` — the last write did not land, so what the user is looking at
 *     lives only in this tab.
 *   • `orphans` — the regenerated plan no longer names channels the user had already
 *     configured; their setup is surfaced with a choice rather than vanishing.
 *
 *  Owns its own colocated `T` dict (the i18n contract) — the strings moved with the
 *  markup, so they are still exactly one copy. */
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    degradedBanner:
      "Uložený plán se nepodařilo načíst. Zobrazujeme ukázkový plán jen ke čtení. Změny stavu jsou dočasně vypnuté, aby nepřepsaly vaši uloženou práci. Obnovte stránku a zkuste to znovu.",
    saveFailedBanner:
      "Poslední změnu se nepodařilo uložit — zobrazený stav je jen v tomto okně a po obnovení stránky zmizí. Zkuste akci zopakovat.",
    orphanNote: "V novém plánu už nejsou tyto dříve nastavené kanály:",
    orphanRemove: "Odebrat jejich nastavení",
    orphanKeep: "Ponechat",
  },
  en: {
    degradedBanner:
      "Couldn't load your saved plan. Showing a read-only sample. Status changes are temporarily disabled so they can't overwrite your saved work. Refresh the page to try again.",
    saveFailedBanner:
      "The last change couldn't be saved — what you see lives only in this window and will disappear on reload. Try the action again.",
    orphanNote: "These previously configured channels are no longer in the new plan:",
    orphanRemove: "Remove their setup",
    orphanKeep: "Keep",
  },
} as const;

const BANNER =
  "rounded-card border border-coral-400 bg-coral-soft px-4 py-3 text-sm leading-relaxed text-coral-600";

export default function ChannelNotices({
  degraded,
  saveFailed,
  orphans,
  onRemoveOrphans,
  onKeepOrphans,
}: {
  /** the saved plan couldn't be read — read-only sample, writes blocked */
  degraded: boolean;
  /** the last persist failed — local-only state */
  saveFailed: boolean;
  /** tracks left behind by the last applied plan */
  orphans: Array<{ id: string; name: string }>;
  onRemoveOrphans: () => void;
  onKeepOrphans: () => void;
}) {
  const t = useT(T);
  return (
    <>
      {degraded && (
        <div role="status" className={BANNER}>
          {t("degradedBanner")}
        </div>
      )}

      {/* A failed persist must not masquerade as a saved change (the degraded
          pattern's sibling: state is local-only until a save lands). It is
          suppressed while `degraded` is on — that banner already says writes are
          off, and two red boxes about the same thing read as two problems. */}
      {saveFailed && !degraded && (
        <div role="status" className={BANNER}>
          {t("saveFailedBanner")}
        </div>
      )}

      {orphans.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas px-4 py-3 text-sm"
        >
          <p className="min-w-0 leading-relaxed text-muted">
            {t("orphanNote")}{" "}
            <span className="font-medium text-navy-800">{orphans.map((o) => o.name).join(", ")}</span>
          </p>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRemoveOrphans}
              className="rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:border-coral-400 hover:text-coral-600"
            >
              {t("orphanRemove")}
            </button>
            <button
              type="button"
              onClick={onKeepOrphans}
              className="text-xs font-medium text-muted transition-colors hover:text-navy-800"
            >
              {t("orphanKeep")}
            </button>
          </span>
        </div>
      )}
    </>
  );
}
