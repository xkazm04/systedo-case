"use client";

import { Check } from "@/components/icons";
import type { ReactNode } from "react";

/** The bottom-center "copied" confirmation toast shared by the heading and FAQ
 *  permalink buttons. Rendered as a sibling of the triggering control (never a
 *  descendant of a heading/summary) so it stays out of accessible names;
 *  role=status announces it politely. */
export default function CopyToast({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <span className="animate-drop inline-flex items-center gap-2 rounded-pill bg-onyx px-4 py-2.5 text-sm font-medium text-white shadow-pop">
        <Check width={16} height={16} className="text-brand-400" />
        {children}
      </span>
    </div>
  );
}
