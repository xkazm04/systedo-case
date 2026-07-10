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
