import type { ReactNode } from "react";

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
