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
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
      <span className="h-px w-6 bg-brand-400" aria-hidden />
      {children}
    </span>
  );
}

type PillTone = "brand" | "navy" | "positive" | "negative" | "neutral" | "coral";

const PILL_TONES: Record<PillTone, string> = {
  brand: "bg-brand-50 text-brand-800",
  navy: "bg-navy-50 text-navy-700",
  positive: "bg-[#e7f4ef] text-positive",
  negative: "bg-[#fbeae7] text-negative",
  neutral: "bg-navy-50 text-muted",
  coral: "bg-[#fff0e9] text-coral-600",
};

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
