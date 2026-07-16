import type { ButtonHTMLAttributes, ReactNode } from "react";

/* The campaigns module's brand CTA — the teal pill button hand-rolled ~5× across
   CampaignsClient / CampaignTable / BudgetMoves / AlertsInbox. It is deliberately
   NOT the design-system <Button> (components/ui.tsx): the ad-ops surfaces add two
   things DS Button's fixed class set can't express without changing pixels —
     • a press affordance — `transition-[background-color,transform]` +
       `active:scale-[0.99]` (DS Button ships `transition-colors`, no transform,
       and its className passthrough can only ADD classes, not swap the transition);
     • compact sizes (`compact`, `micro`, text-xs) below DS Button's smallest `sm`,
       used in the dense table rows and the alert-inbox dropdown.
   The `press` flag also carries the disabled convention each flavour already used
   (press → cursor-not-allowed + opacity-50; static → opacity-60), so every call
   site's classes are reproduced EXACTLY — the only uniform addition is an invisible
   `justify-center`, a no-op on these auto-width buttons. Visual output is unchanged;
   this is consolidation, not a restyle. Use DS <Button> for anything outside this
   brand-pill pattern. */

export type PillButtonSize = "lg" | "md" | "compact" | "micro";

const SIZES: Record<PillButtonSize, string> = {
  lg: "px-5 py-3 text-sm gap-2",
  md: "px-5 py-2.5 text-sm gap-2",
  compact: "px-3 py-1.5 text-xs gap-1.5",
  micro: "px-3 py-1 text-xs gap-1",
};

const BASE =
  "inline-flex items-center justify-center rounded-pill bg-brand-600 font-semibold text-white hover:bg-brand-700";

// press = the tactile CTA (background+transform transition + scale on click);
// static = the plainer colour-only transition. Each ships its own disabled look.
const PRESS =
  "transition-[background-color,transform] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";
const STATIC = "transition-colors disabled:opacity-60";

export function PillButton({
  children,
  size = "md",
  press = false,
  className = "",
  type = "button",
  ...rest
}: {
  children: ReactNode;
  size?: PillButtonSize;
  /** true → the tactile CTA (press-scale, cursor-not-allowed disabled state);
   *  false → the plainer colour-only transition (opacity-60 disabled state). */
  press?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type={type}
      className={[BASE, SIZES[size], press ? PRESS : STATIC, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

export default PillButton;
