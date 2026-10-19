"use client";

/** RankClimbDemo — the interactive marketing hero (ported and rethekied from the
 *  local-SEO app). Press "Run" and "Vaše pobočka" layout-animates from slot #4 to
 *  slot #1, a brand-accent ping fires, and the stat counters tick up. No mapping
 *  library — a token-driven canvas with concentric contour rings drawn as
 *  background radial-gradients (color-mix keeps them visible in light + dark).
 *
 *  Uses full `motion` (layout animation) which loads lazily under the marketing
 *  <MotionProvider>. All motion short-circuits under prefers-reduced-motion. */
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  animate,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { easeAdamant, pingPulse } from "@/lib/motion";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  RANK_CLIMB_T as T,
  SLOT_COORDS,
  initialOrder,
  optimizedOrder,
  type Pin,
  type RankClimbLabels,
} from "@/components/marketing/rank-climb-data";
import { MapCanvas, PinMarker, RankClimbControls, RankClimbStatus, Stat } from "@/components/marketing/RankClimbParts";

export type { RankClimbLabels } from "@/components/marketing/rank-climb-data";

export function RankClimbDemo({ labels: partial }: { labels?: Partial<RankClimbLabels> }) {
  const { locale } = useLocale();
  const labels = { ...(T[locale] ?? T.cs), ...partial };
  const reduce = useReducedMotion();
  const [order, setOrder] = useState<Pin[]>(() => initialOrder(labels.you));
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [pinging, setPinging] = useState(false);
  const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayRaf = useRef<number | null>(null);

  const avgRank = useMotionValue(4);
  const visibility = useMotionValue(12);
  const avgRankRounded = useTransform(avgRank, (v) => Math.round(v).toString());
  const visibilityRounded = useTransform(visibility, (v) => `${Math.round(v)} %`);

  useEffect(() => {
    return () => {
      if (pingTimer.current) clearTimeout(pingTimer.current);
      if (doneTimer.current) clearTimeout(doneTimer.current);
      if (replayRaf.current) cancelAnimationFrame(replayRaf.current);
    };
  }, []);

  // `instant` matters on the Replay path. The counters have two writers: this one
  // returning them to the idle figures, and `start()` driving them to the optimized
  // ones. Replay fires `start()` on the very next frame, so an ANIMATED return is
  // still in flight when the climb begins and the climb inherits wherever it got to
  // rather than the idle value — under easeAdamant that is roughly a third of the way
  // already, so the replay shows avgRank counting 2→1 instead of 4→1. Setting the
  // value gives the second writer an explicit starting point on every path.
  const reset = ({ instant = false }: { instant?: boolean } = {}) => {
    setRunning(false);
    setHasRun(false);
    setPinging(false);
    setOrder(initialOrder(labels.you));
    if (instant) {
      avgRank.set(4);
      visibility.set(12);
    } else {
      animate(avgRank, 4, { duration: 0.4, ease: easeAdamant });
      animate(visibility, 12, { duration: 0.4, ease: easeAdamant });
    }
    if (pingTimer.current) clearTimeout(pingTimer.current);
    if (doneTimer.current) clearTimeout(doneTimer.current);
  };

  // The actual climb sequence (#4 → #1), factored out so Replay can reset THEN run.
  const start = () => {
    setRunning(true);
    setHasRun(true);
    setOrder(optimizedOrder(labels.you));
    animate(avgRank, 1, { duration: 1.5, ease: easeAdamant });
    animate(visibility, 67, { duration: 1.5, ease: easeAdamant });

    const pingDelay = reduce ? 0 : 1500;
    pingTimer.current = setTimeout(() => {
      setPinging(true);
      pingTimer.current = setTimeout(() => setPinging(false), 1600 * 3);
    }, pingDelay);
    doneTimer.current = setTimeout(() => setRunning(false), pingDelay + 1600 * 3);
  };

  const run = () => {
    if (running) return;
    if (hasRun) {
      // Replay = reset to the initial layout, then run again on the next frame so the
      // pin migration actually re-plays in ONE click (the old path only reset and
      // relabelled to "Run", forcing a confusing second click).
      reset({ instant: true });
      replayRaf.current = requestAnimationFrame(() => {
        replayRaf.current = null;
        start();
      });
      return;
    }
    start();
  };

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <RankClimbControls
        running={running}
        runLabel={running ? labels.running : hasRun ? labels.replay : labels.run}
        resetLabel={labels.reset}
        onRun={run}
        onReset={() => reset()}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr]">
        {/* Map canvas */}
        <div className="relative aspect-[5/4] overflow-hidden border-b border-line bg-canvas lg:border-b-0 lg:border-r">
          <MapCanvas />
          {order.map((p, idx) => {
            const slot = SLOT_COORDS[idx];
            const isRank1 = idx === 0;
            return (
              <motion.div
                key={p.id}
                layout
                transition={{ duration: 1.5, ease: easeAdamant }}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              >
                <div className="relative">
                  {p.you && isRank1 && pinging ? (
                    <motion.span
                      aria-hidden
                      variants={pingPulse}
                      initial="rest"
                      animate="pulse"
                      className="pointer-events-none absolute inset-[-10px] rounded-[10px] border-2 border-brand-500"
                    />
                  ) : null}
                  {/* the "you" pin's name renders from the live labels so a locale
                      switch localizes it even though the order state was seeded
                      with the mount-time name */}
                  <PinMarker rank={idx + 1} label={p.you ? labels.you : p.name} reviews={p.reviews} you={p.you} />
                </div>
              </motion.div>
            );
          })}

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-line bg-surface/80 px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted backdrop-blur">
            <span>50.08 N</span>
            <span>14.42 E</span>
            <span>{running ? labels.signalStrong : labels.signalIdle}</span>
          </div>
        </div>

        {/* Readout panel */}
        <div className="flex flex-col justify-between gap-8 p-6">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted">
              {labels.readouts}
            </div>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-navy-800">
              {labels.beforeAfter}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{labels.beforeAfterSub}</p>

            <dl className="mt-7 space-y-6">
              <Stat label={labels.avgRank} before="#4" current={avgRankRounded} prefix="#" after="1" target={labels.target} />
              <Stat label={labels.visibility} before="12 %" current={visibilityRounded} after="67 %" target={labels.target} />
            </dl>
          </div>

          <RankClimbStatus running={running} firing={labels.rank1Firing} idle={labels.idleAwaiting} />
        </div>
      </div>
    </div>
  );
}
