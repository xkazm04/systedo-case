"use client";

/** The alert → change-set → apply thread spans three panels. These anchor ids +
 *  the reveal helper let a chip/pill in one panel scroll to and briefly flash the
 *  related target in another, making the data thread visible without any new
 *  cross-component state. */
export const THREAD_ANCHORS = {
  alertsInbox: "alerts-inbox",
  controlPlane: "control-plane",
} as const;

/** Transient ring flash — plain Tailwind utilities toggled by class, so no global
 *  keyframe is needed. The classes are literal here, so Tailwind's content scan
 *  emits them. */
const HIGHLIGHT = ["ring-2", "ring-brand-400", "ring-offset-2"];

/** Scroll a thread target into view and flash a ring highlight (~1.8s). No-op if
 *  the target isn't mounted yet (e.g. the control plane before it has loaded, or
 *  an anonymous visitor for whom the inbox renders nothing). */
export function revealThreadTarget(id: string): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add(...HIGHLIGHT);
  window.setTimeout(() => el.classList.remove(...HIGHLIGHT), 1800);
}
