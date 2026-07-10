import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/** Standard page gutter + max width. */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

/** Small uppercase kicker above a heading. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-accent">
      <span className="h-px w-6 bg-brand-400" aria-hidden />
      {children}
    </span>
  );
}

export type PillTone = "brand" | "navy" | "positive" | "negative" | "neutral" | "coral";

const PILL_TONES: Record<PillTone, string> = {
  brand: "bg-brand-50 text-brand-800",
  navy: "bg-navy-50 text-navy-700",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  neutral: "bg-navy-50 text-muted",
  coral: "bg-coral-soft text-coral-600",
};

/** Every available Pill tone, so the design-system showcase can enumerate them
 *  straight from the source of truth instead of hard-coding the list. */
export const PILL_TONE_NAMES = Object.keys(PILL_TONES) as PillTone[];

/** The text-color half of each Pill tone, for stat/summary labels that want the
 *  semantic tone color WITHOUT the pill chip background. Derived from PILL_TONES
 *  so a tone rebrand (e.g. `text-coral-600` → a new class) updates both the
 *  <Pill> chip and every bare-label consumer in lock-step, instead of leaving
 *  hand-rolled ternaries to drift. Values are byte-identical to the text-* class
 *  inside each PILL_TONES entry. */
export const TONE_TEXT: Record<PillTone, string> = Object.fromEntries(
  (Object.entries(PILL_TONES) as [PillTone, string][]).map(([tone, cls]) => [
    tone,
    cls.split(" ").find((c) => c.startsWith("text-")) ?? cls,
  ])
) as Record<PillTone, string>;

export function Pill({
  children,
  tone = "brand",
  className = "",
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  return <span className={`pill ${PILL_TONES[tone]} ${className}`}>{children}</span>;
}

/* ---------------------------------------------------------------------------
   Button — the shared interactive primitive. Extracted from the ~185 hand-rolled
   <button>/<a> across the app, which repeated four visual patterns by hand. The
   variant/size classes below reproduce those patterns EXACTLY, so adopting
   <Button> is a zero-visual-change centralisation:
     • primary   → the teal CTA (bg-brand-600, white)
     • secondary → the outline button (border-line, navy text)
     • onyx      → the dark CTA (bg-onyx, white — footer/hero/panel headers)
     • ghost     → text-only affordance
   Pass `href` to render an <a> (with the identical styling) instead of a <button>.
--------------------------------------------------------------------------- */
export type ButtonVariant = "primary" | "secondary" | "onyx" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-pill transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 font-semibold text-white hover:bg-brand-700",
  secondary: "border border-line font-medium text-navy-700 hover:border-brand-300 hover:text-brand-accent",
  onyx: "bg-onyx font-semibold text-white hover:bg-navy-800",
  ghost: "font-medium text-navy-700 hover:text-brand-accent",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-5 py-3 text-sm",
};

/** Every variant / size, so the design-system showcase enumerates them straight
 *  from the source of truth instead of a hand-kept list. */
export const BUTTON_VARIANT_NAMES = Object.keys(BUTTON_VARIANTS) as ButtonVariant[];
export const BUTTON_SIZE_NAMES = Object.keys(BUTTON_SIZES) as ButtonSize[];

/** Compose the button class string — exported so a non-Button element (e.g. a
 *  Next <Link>, which Button can't render without pulling next/link into this
 *  shared module) can wear the identical styling: `<Link className={buttonClass("primary")}>`. */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  opts: { fullWidth?: boolean; className?: string } = {}
): string {
  const { fullWidth = false, className = "" } = opts;
  return [BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], fullWidth ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
}

type ButtonBaseProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

/** Shared button/link primitive. Renders an <a> when `href` is set (same styling),
 *  otherwise a <button> that defaults to type="button" (so it never submits a form
 *  by accident — the single most common hand-rolled-button footgun). */
export function Button(
  props: ButtonBaseProps &
    (
      | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps>)
      | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps>)
    )
) {
  const { children, variant = "primary", size = "md", fullWidth = false, className = "", ...rest } = props;
  const cls = buttonClass(variant, size, { fullWidth, className });

  if (rest.href != null) {
    return (
      <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string })}>
        {children}
      </a>
    );
  }
  const { type = "button", ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={cls} {...buttonRest}>
      {children}
    </button>
  );
}
