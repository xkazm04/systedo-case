"use client";

/** WP S1 / ADR-0010 — pick WHICH ad network the control plane proposes and writes
 *  against. Two pills, rendered only when a project actually resolves to more than
 *  one writable network; a single-network console never mounts this.
 *
 *  Why a switch and not a union: the campaign TABLE reads both networks at once, but
 *  a change-set is created, approved and reverted against exactly ONE tenant
 *  (ADR-0010 — a union read is not a union write). So the console has to say which
 *  account it is about to touch rather than implying it can move money between them. */
import { useT } from "@/lib/i18n/client";

export type WritableSource = "google-ads" | "sklik";

const T = {
  cs: {
    label: "Síť",
    "google-ads": "Google Ads",
    sklik: "Sklik",
    title: "Změnový balíček se vždy týká jedné sítě — vyberte, do které se bude zapisovat.",
  },
  en: {
    label: "Network",
    "google-ads": "Google Ads",
    sklik: "Sklik",
    title: "A change set always concerns one network — pick the one it will write to.",
  },
} as const;

export default function SourceSwitch({
  sources,
  active,
  disabled,
  onSelect,
}: {
  sources: WritableSource[];
  active: WritableSource;
  disabled: boolean;
  onSelect: (s: WritableSource) => void;
}) {
  const t = useT(T);
  if (sources.length < 2) return null;
  return (
    <div className="mt-3 flex items-center gap-2" title={t("title")}>
      <span className="text-xs font-medium text-muted">{t("label")}</span>
      {sources.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          aria-pressed={s === active}
          onClick={() => onSelect(s)}
          className={`pill cursor-pointer transition-colors disabled:opacity-60 ${
            s === active ? "bg-brand-700 text-white" : "bg-navy-50 text-muted hover:text-brand-accent"
          }`}
        >
          {t(s)}
        </button>
      ))}
    </div>
  );
}
