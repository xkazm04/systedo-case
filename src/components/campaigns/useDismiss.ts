"use client";

import { useEffect, useRef } from "react";

/** Lightweight popover/dropdown dismissal contract: closes on an outside click
 *  (mousedown) or Escape while `open`. Returns a ref to attach to the container
 *  that should stay open when clicked inside. Extracted from SyncProvenance's
 *  hand-rolled version so AlertsInbox, ActivityFeed and SyncProvenance share one
 *  implementation. `onClose` is read through a ref so it needn't be memoised by
 *  the caller (the effect only re-runs when `open` flips). */
export function useDismiss<T extends HTMLElement = HTMLElement>(
  open: boolean,
  onClose: () => void
) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  // Keep the latest onClose without widening the dismissal effect's deps (which
  // stays [open]) — updating a ref during render is disallowed, so do it here.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return ref;
}
