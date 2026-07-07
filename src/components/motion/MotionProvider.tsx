"use client";

/** LazyMotion provider — ships only the DOM-animation feature set for the app's
 *  `<m.*>` primitives (see Kinetics.tsx) instead of the full `motion` bundle.
 *  Heavier features load lazily only if a full `motion` component mounts (e.g.
 *  RankClimbDemo's layout animation). Wrap any subtree that uses the Kinetics
 *  `<Kinetic>`/`<Marquee>` primitives in this so every `<m.*>` has its required
 *  ancestor. Scoped to the marketing surfaces, not the whole app — Adamant's
 *  product UI stays on the CSS-token animation family. */
import { LazyMotion, domAnimation } from "framer-motion";
import { type ReactNode } from "react";

export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
