"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copyTextWithFallback } from "@/lib/clipboard";

/** The copy-affordance state machine that every "copy" button in the app grew
 *  its own copy of: put `text` on the clipboard (via {@link copyTextWithFallback}),
 *  flash a `copied` flag `true`, then auto-reset it after `resetMs`, cancelling
 *  the pending timer on unmount and on rapid re-clicks.
 *
 *  Returns `{ copied, copy }` where `copy(text)` runs the clipboard write + flash.
 *  The default 2200 ms matches the article share/permalink toasts; pass a
 *  different value to preserve a caller's own timing. */
export function useCopyFeedback(resetMs = 2200): {
  copied: boolean;
  copy: (text: string) => Promise<void>;
} {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Cancel any pending reset on unmount.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      await copyTextWithFallback(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), resetMs);
    },
    [resetMs]
  );

  return { copied, copy };
}
