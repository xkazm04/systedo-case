"use client";

import { useState } from "react";
import { Check, Copy } from "@/components/icons";
import { readableInkOn } from "@/lib/design-tokens-color";
import { copyTextWithFallback } from "@/lib/clipboard";
import type { ColorToken } from "@/lib/design-tokens";
import { useT } from "@/lib/i18n/client";
import type { TDict } from "@/lib/i18n/interpolate";

const T = {
  cs: {
    copyTitle: "Kopírovat {cssVar}",
    copyAriaLabel: "Kopírovat název tokenu {cssVar}",
    copied: "Zkopírováno",
    failed: "Kopírování selhalo",
  },
  en: {
    copyTitle: "Copy {cssVar}",
    copyAriaLabel: "Copy the token name {cssVar}",
    copied: "Copied",
    failed: "Copy failed",
  },
} satisfies TDict<"copyTitle" | "copyAriaLabel" | "copied" | "failed">;

/** Click-to-copy colour swatch: copies the CSS variable name (e.g.
 *  "--color-brand-500") so the living showcase doubles as a working DS reference,
 *  not just a display. A transient check confirms the copy; a failure is shown
 *  explicitly (a dead-feeling click on a working DS reference is the worst UX). */
export default function Swatch({ token, big = false }: { token: ColorToken; big?: boolean }) {
  const t = useT(T);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copied = status === "copied";

  const copy = async () => {
    // Use the shared helper (execCommand fallback + a success boolean) instead of a
    // bare navigator.clipboard with an empty catch, matching DevInspector; on an
    // insecure context / denied permission the user now sees a translated failure
    // message rather than a silent no-op.
    const ok = await copyTextWithFallback(token.cssVar);
    setStatus(ok ? "copied" : "failed");
    setTimeout(() => setStatus("idle"), 1200);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={t("copyTitle", { cssVar: token.cssVar })}
      aria-label={t("copyAriaLabel", { cssVar: token.cssVar })}
      className="group min-w-0 text-left"
    >
      <div
        className={`flex ${big ? "h-20" : "h-16"} items-end justify-between rounded-xl border border-line/60 p-2 transition-shadow group-hover:shadow-card`}
        // Paint from the parsed hex (the value shown as the label), not the live
        // `var(--color-…)`: dark mode redefines several tokens, so the live var and
        // the ink readableInkOn() picked for the light hex would disagree. One hex →
        // background + label + ink, always consistent across themes.
        style={{ background: token.value, color: readableInkOn(token.value) }}
      >
        <span className="tnum text-[13px] font-medium opacity-90">{token.step ?? token.name}</span>
        <span aria-hidden className="opacity-0 transition-opacity group-hover:opacity-90 group-focus-visible:opacity-90">
          {copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
        </span>
      </div>
      <p className="mt-1.5 truncate text-[13px] font-medium text-navy-700">{token.name}</p>
      <p className={`tnum truncate text-[13px] uppercase ${status === "failed" ? "text-coral-600" : "text-muted"}`}>
        {status === "copied" ? t("copied") : status === "failed" ? t("failed") : token.value}
      </p>
    </button>
  );
}
