"use client";

import { useState } from "react";
import { Check, Copy } from "@/components/icons";
import { readableInkOn } from "@/lib/design-tokens-color";
import type { ColorToken } from "@/lib/design-tokens";

/** Click-to-copy colour swatch: copies the CSS variable name (e.g.
 *  "--color-brand-500") so the living showcase doubles as a working DS reference,
 *  not just a display. A transient check confirms the copy. */
export default function Swatch({ token, big = false }: { token: ColorToken; big?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token.cssVar);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Kopírovat ${token.cssVar}`}
      aria-label={`Kopírovat název tokenu ${token.cssVar}`}
      className="group min-w-0 text-left"
    >
      <div
        className={`flex ${big ? "h-20" : "h-16"} items-end justify-between rounded-xl border border-line/60 p-2 transition-shadow group-hover:shadow-card`}
        style={{ background: `var(${token.cssVar})`, color: readableInkOn(token.value) }}
      >
        <span className="tnum text-[13px] font-medium opacity-90">{token.step ?? token.name}</span>
        <span aria-hidden className="opacity-0 transition-opacity group-hover:opacity-90 group-focus-visible:opacity-90">
          {copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
        </span>
      </div>
      <p className="mt-1.5 truncate text-[13px] font-medium text-navy-700">{token.name}</p>
      <p className="tnum truncate text-[13px] uppercase text-muted">{copied ? "Zkopírováno" : token.value}</p>
    </button>
  );
}
