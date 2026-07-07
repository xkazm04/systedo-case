"use client";

/** Kinetics — shared motion primitives for Adamant's marketing surfaces (ported
 *  and rethekied from the local-SEO app as part of the consolidation).
 *
 *   • <ChartReveal>  mounts its child only while in view, so a chart re-plays its
 *                    draw-in every time it is scrolled back to (the "wow" on
 *                    section arrival).
 *   • <Tally>        a number that counts up to `to` when it enters the viewport.
 *   • <Kinetic>      a fade + lift wrapper (in-view) — the section workhorse.
 *   • <Marquee>      an infinite horizontal ticker.
 *
 *  All four short-circuit to a static render under prefers-reduced-motion, so
 *  they inherit the same accessibility contract as the globals.css animations.
 *  Requires a <MotionProvider> ancestor (the `m.*` primitives need LazyMotion). */
import { animate, m, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { easeAdamant } from "@/lib/motion";

export function ChartReveal({
  children,
  className,
  amount = 0.35,
}: {
  children: ReactNode;
  className?: string;
  amount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount });
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className={className}>
      {inView || reduce ? children : null}
    </div>
  );
}

export function Tally({
  to,
  from = 0,
  duration = 1.4,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  to: number;
  from?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const reduce = useReducedMotion();
  const [val, setVal] = useState(from);

  useEffect(() => {
    if (reduce || !inView) return;
    const controls = animate(from, to, {
      duration,
      ease: easeAdamant,
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, from, to, duration, reduce]);

  const shown = reduce ? to : val;
  const text = decimals > 0 ? shown.toFixed(decimals) : Math.round(shown).toString();
  return (
    <span ref={ref} className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

type KineticTag = "div" | "li" | "section" | "article";

export function Kinetic({
  children,
  className,
  delay = 0,
  y = 18,
  once = false,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
  as?: KineticTag;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const MotionTag = m[as];
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.4 }}
      transition={{ duration: 0.6, ease: easeAdamant, delay }}
    >
      {children}
    </MotionTag>
  );
}

/** Infinite horizontal ticker. `items` repeat seamlessly; pauses under reduce. */
export function Marquee({
  items,
  className,
  duration = 28,
  separator = "·",
}: {
  items: ReactNode[];
  className?: string;
  duration?: number;
  separator?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const row = (
    <div className="flex shrink-0 items-center gap-8 pr-8" aria-hidden>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-8">
          {it}
          <span className="text-muted/50">{separator}</span>
        </span>
      ))}
    </div>
  );
  if (reduce) {
    return <div className={"flex overflow-hidden " + (className ?? "")}>{row}</div>;
  }
  return (
    <div className={"flex overflow-hidden " + (className ?? "")}>
      <m.div
        className="flex"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        {row}
        {row}
      </m.div>
    </div>
  );
}
