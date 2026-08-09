"use client";

/** One selectable option card in the channel setup wizard (mode / inbox steps):
 *  a labelled radio-like button with a hint line and an optional badge. */
export default function OptionCard({
  selected,
  onSelect,
  label,
  hint,
  badge,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex-1 rounded-card border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? "border-brand-400 bg-brand-50" : "border-line hover:border-navy-200"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold text-navy-800">{label}</span>
        {badge && <span className="pill bg-positive-soft text-positive">{badge}</span>}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-muted">{hint}</span>
    </button>
  );
}
