"use client";
/** "Hidden (n)" — the recommendations the operator dismissed that are still firing,
 *  in a collapsed disclosure under the Needs-attention feed. Restore PATCHes the
 *  subject back to `open` (through AdviceFeed's verdict, so it shares the optimistic
 *  state machine and its notices); the row then returns to its place in the feed.
 *  A dismissal is "not this one", never "forget it" — this is where it is undone. */
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    heading: "Skryté ({n})",
    restore: "Obnovit",
    restoreLabel: "Obnovit doporučení „{title}“",
  },
  en: {
    heading: "Hidden ({n})",
    restore: "Restore",
    restoreLabel: "Restore recommendation “{title}”",
  },
} as const;

export default function DismissedAdvice({
  items,
  onRestore,
}: {
  items: { subjectKey: string; title: string }[];
  onRestore: (subjectKey: string) => void;
}) {
  const t = useT(T);
  if (items.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer list-none px-1 text-xs font-semibold text-muted transition-colors hover:text-navy-700">
        {t("heading", { n: items.length })}
      </summary>
      <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-canvas">
        {items.map((item) => (
          <li key={item.subjectKey} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-0 truncate text-muted">{item.title}</span>
            <button
              type="button"
              onClick={() => onRestore(item.subjectKey)}
              aria-label={t("restoreLabel", { title: item.title })}
              className="shrink-0 text-xs font-semibold text-brand-accent hover:underline"
            >
              {t("restore")}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
