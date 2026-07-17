/** Framer Motion easing + variants for Adamant's marketing motion (the hybrid
 *  layer from the local-SEO consolidation — see docs/roadmap/local-seo-
 *  consolidation.md). Centralised so every animated surface eases on the same
 *  curve as the CSS `.animate-fade-up` / `.stagger` family in globals.css.
 *
 *  Framework-free (only a framer-motion *type* import), so it can be shared by
 *  any client component without pulling a runtime in. */
import type { Variants } from "framer-motion";

/** The house curve — matches globals.css `cubic-bezier(0.16, 1, 0.3, 1)`: a
 *  slow, confident settle. Keep the two in sync so JS- and CSS-driven motion
 *  read as one system. */
export const easeAdamant: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Render the current value of a count-up (`<Tally>`). A `format` callback is the
 *  supported way to route the number through the app's locale-aware chokepoint
 *  (`createFormatters(locale).fmtInt` / `fmtCZKCompact` …) so animated hero stats
 *  match every static number on the page — grouping separators, cs comma decimals
 *  and currency placement included. Without one it falls back to the legacy bare
 *  `toFixed`/round (dot decimal, no separators) so existing callers are unchanged. */
export function tallyText(
  value: number,
  opts: { format?: (n: number) => string; decimals?: number } = {}
): string {
  if (opts.format) return opts.format(value);
  const decimals = opts.decimals ?? 0;
  return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
}

/** Fade + lift, the workhorse entrance (mirrors `.animate-fade-up`). */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: easeAdamant },
  },
};

/** Parent that eases its children in sequence (the JS analogue of `.stagger`). */
export const staggerParent: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
};

/** pingPulse — the brand-accent ring radiating from a rank-1 pin. */
export const pingPulse: Variants = {
  rest: { opacity: 0, scale: 1 },
  pulse: {
    opacity: [0.55, 0],
    scale: [1, 1.6],
    transition: { duration: 1.6, ease: easeAdamant, repeat: Infinity },
  },
};
