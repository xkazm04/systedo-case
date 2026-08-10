/** The exact UTM-stamped link shipped in this variant — visible and copyable, so
 *  the attribution table's `utm_source` column is verifiable against what actually
 *  goes out rather than merely implied. */
"use client";

import { Check, Link } from "@/components/icons";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    utmLabel: "Odkaz s UTM",
    copyAriaLabel: "Kopírovat odkaz s UTM pro {channel}",
    linkBtn: "Odkaz",
    copied: "Zkopírováno",
  },
  en: {
    utmLabel: "UTM link",
    copyAriaLabel: "Copy UTM link for {channel}",
    linkBtn: "Link",
    copied: "Copied",
  },
} as const;

export default function VariantLinkRow({
  channel,
  link,
  onCopied,
}: {
  channel: string;
  link: string;
  /** the link left the app — beacon + advance the variant's status */
  onCopied: () => void;
}) {
  const t = useT(T);
  const { copied, copy } = useCopyFeedback();
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
      <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">{t("utmLabel")}</span>
      <code className="flex-1 truncate font-mono text-[0.7rem] text-navy-600" title={link}>
        {link.replace("https://", "")}
      </code>
      <button
        type="button"
        onClick={() => void copy(link).then(onCopied)}
        aria-label={t("copyAriaLabel", { channel })}
        className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-line bg-surface px-2 py-1 text-[0.7rem] font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
      >
        {copied ? <Check width={12} height={12} className="text-positive" /> : <Link width={12} height={12} />}
        <span>{copied ? t("copied") : t("linkBtn")}</span>
      </button>
    </div>
  );
}
