"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link } from "@/components/icons";
import CopyToast from "./CopyToast";
import { buildSectionPermalink, copyTextWithFallback } from "./permalink";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    copyLinkAria: "Kopírovat odkaz na otázku: {text}",
    copyLinkTitle: "Kopírovat odkaz na otázku",
    copiedToast: "Odkaz na otázku zkopírován",
  },
  en: {
    copyLinkAria: "Copy link to question: {text}",
    copyLinkTitle: "Copy link to question",
    copiedToast: "Question link copied",
  },
} as const;

/** Compact copy-permalink affordance for a FAQ question — the FAQ counterpart
 *  of HeadingAnchor's "#" button, sharing the exact UTM-stamped link format via
 *  ./permalink. Lives INSIDE the <summary>, so the click must not toggle the
 *  accordion (preventDefault on the summary's activation). Revealed on hover of
 *  the question row; always faintly visible on touch, where hover can't reveal it. */
export default function FaqPermalink({ id, question }: { id: string; question: string }) {
  const t = useT(T);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Clear any pending toast timer on unmount.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copyLink = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // A click inside <summary> would toggle the <details>; this one only copies.
    e.preventDefault();
    e.stopPropagation();

    await copyTextWithFallback(
      buildSectionPermalink(window.location.origin, window.location.pathname, id)
    );
    // Reflect the anchor in the address bar (the question is already in view).
    history.replaceState(null, "", `#${id}`);

    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <>
      <button
        type="button"
        onClick={copyLink}
        aria-label={t("copyLinkAria", { text: question })}
        title={t("copyLinkTitle")}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:text-brand-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 group-hover:opacity-100 print:hidden [@media(hover:none)]:opacity-60"
      >
        {copied ? (
          <Check width={15} height={15} className="text-positive" />
        ) : (
          <Link width={15} height={15} />
        )}
      </button>
      {copied && <CopyToast>{t("copiedToast")}</CopyToast>}
    </>
  );
}
