"use client";
/** Esc returns from a room to its roof — unless focus is in a field, a dialog is
 *  open, or another handler already took the key. Renders nothing. */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EscBack({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], dialog")) return;
      if (document.querySelector("dialog[open], [role='dialog'][aria-modal='true']")) return;
      router.push(href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [href, router]);
  return null;
}
