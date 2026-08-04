"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Close } from "@/components/icons";
import { useFocusTrap } from "@/components/hooks/useFocusTrap";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    close: "Zavřít",
  },
  en: {
    close: "Close",
  },
} as const;

/** The dialog's max width. `full` is a near-viewport workspace (brief → draft). */
export type ModalSize = "md" | "lg" | "full";

const SIZES: Record<ModalSize, string> = {
  md: "max-w-2xl",
  lg: "max-w-4xl",
  full: "max-w-5xl",
};

/** Shared dialog shell for the app's two-layer (table → detail/add) UI.
 *
 *  There is no other reusable overlay in the codebase — every prior modal was
 *  hand-rolled (CommandPalette, ProjectSwitcher…). This centralises the four
 *  things every one of them got right or wrong ad hoc: a portal to <body> (so the
 *  dialog escapes any `overflow-hidden`/transformed ancestor), a backdrop that
 *  closes on click, Escape-to-close, and a body-scroll lock while open. The panel
 *  itself scrolls (`max-h`/`overflow-y-auto`) so a tall workspace never pushes the
 *  page. Styling mirrors the CommandPalette shell (bg-surface / border-line /
 *  shadow-pop) so it reads as the same system in light and dark. */
export default function Modal({
  open,
  onClose,
  title,
  description,
  ariaLabel,
  size = "md",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Accessible name when there is no string `title` (a headerless dialog would
   *  otherwise be an unlabelled role="dialog"). */
  ariaLabel?: string;
  size?: ModalSize;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT(T);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes; body scroll locks while open. One effect, gated on `open` so
  // the listener/lock only exist for the lifetime of the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Move focus into the dialog, trap Tab/Shift+Tab inside it (so `aria-modal`'s
  // inert-background claim holds for keyboard users), and restore focus to the
  // triggering control on close.
  useFocusTrap(panelRef, open);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-onyx/40 px-4 py-[6vh] backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className={`animate-drop relative flex w-full ${SIZES[size]} max-h-[88vh] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop outline-none`}
      >
        {title || description ? (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-navy-800">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <CloseButton onClose={onClose} label={t("close")} className="-mr-1" />
          </div>
        ) : (
          // Headerless dialog: keep the dismiss control discoverable (touch users
          // have no Escape key, and size="full" can cover the backdrop) by
          // floating the X in the panel's top-right corner.
          <CloseButton onClose={onClose} label={t("close")} className="absolute right-3 top-3 z-10" />
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** The dialog's dismiss control — rendered inside the header row when there is one,
 *  and floated in the panel corner when the dialog is headerless. */
function CloseButton({
  onClose,
  label,
  className = "",
}: {
  onClose: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-navy-800 ${className}`}
    >
      <Close width={16} height={16} />
    </button>
  );
}
