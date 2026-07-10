"use client";

import { Check, Document } from "@/components/icons";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    label: "Zkopírovat celý článek jako Markdown — pro AI asistenty a další zpracování",
    btn: "Markdown",
    copied: "Zkopírováno",
    toast: "Článek zkopírován jako Markdown",
  },
  en: {
    label: "Copy the whole article as Markdown — for AI assistants and reuse",
    btn: "Markdown",
    copied: "Copied",
    toast: "Article copied as Markdown",
  },
} as const;

/** „Copy for AI" affordance beside the ShareBar: puts the server-serialized
 *  Markdown twin of the article on the clipboard (headings, lists, callouts,
 *  links preserved), so a reader can hand the piece to an assistant or take it
 *  along. The string arrives pre-serialized from the server page — this island
 *  only does the clipboard + toast dance, mirroring the ShareBar pattern. */
export default function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const t = useT(T);
  const { copied, copy } = useCopyFeedback();

  const copyMarkdown = () => copy(markdown);

  return (
    <>
      <button
        type="button"
        onClick={copyMarkdown}
        aria-label={t("label")}
        title={t("label")}
        className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
      >
        {copied ? (
          <Check width={14} height={14} className="text-positive" />
        ) : (
          <Document width={14} height={14} />
        )}
        <span>{copied ? t("copied") : t("btn")}</span>
      </button>

      {/* Confirmation toast, shared shape with the ShareBar's. role=status announces it. */}
      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
        >
          <span className="animate-drop inline-flex items-center gap-2 rounded-pill bg-onyx px-4 py-2.5 text-sm font-medium text-white shadow-pop">
            <Check width={16} height={16} className="text-brand-400" />
            {t("toast")}
          </span>
        </div>
      )}
    </>
  );
}
