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
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  animate,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { easeAdamant, pingPulse } from "@/lib/motion";

export interface RankClimbLabels {
  run: string;
  running: string;
  replay: string;
  reset: string;
  avgRank: string;
  visibility: string;
  target: string;
  readouts: string;
  beforeAfter: string;
  beforeAfterSub: string;
  rank1Firing: string;
  idleAwaiting: string;
  signalStrong: string;
  signalIdle: string;
  you: string;
}

const DEFAULT_LABELS: RankClimbLabels = {
  run: "Spustit optimalizaci",
  running: "Běží…",
  replay: "Přehrát znovu",
  reset: "Reset",
  avgRank: "Průměrná pozice v mapě",
  visibility: "Viditelnost v map packu",
  target: "cíl",
  readouts: "Živé hodnoty",
  beforeAfter: "Před a po.",
  beforeAfterSub: "Stejných pět konkurentů, stejné hledání. Změnila se jen práce.",
  rank1Firing: "Pozice #1 · signál běží",
  idleAwaiting: "Nečinné · čeká na signál",
  signalStrong: "Signál · SILNÝ",
  signalIdle: "Signál · KLID",
  you: "Vaše pobočka",
};

type Pin = { id: string; name: string; reviews: string; you?: boolean };

const initialOrder = (you: string): Pin[] => [
  { id: "a", name: "Rival A", reviews: "311 · 4,7" },
  { id: "b", name: "Rival B", reviews: "428 · 4,8" },
  { id: "c", name: "Rival C", reviews: "184 · 4,7" },
  { id: "you", name: you, reviews: "176 · 4,9", you: true },
  { id: "d", name: "Rival D", reviews: "212 · 4,6" },
];

const optimizedOrder = (you: string): Pin[] => [
  { id: "you", name: you, reviews: "176 · 4,9", you: true },
  { id: "b", name: "Rival B", reviews: "428 · 4,8" },
  { id: "a", name: "Rival A", reviews: "311 · 4,7" },
  { id: "c", name: "Rival C", reviews: "184 · 4,7" },
  { id: "d", name: "Rival D", reviews: "212 · 4,6" },
];

// Each rank slot maps to a canvas coordinate, so the layout animation reads as a
// pin migration rather than vertical reflow.
const SLOT_COORDS = [
  { x: 50, y: 36 }, // #1
  { x: 26, y: 28 }, // #2
  { x: 74, y: 30 }, // #3
  { x: 32, y: 64 }, // #4
  { x: 72, y: 66 }, // #5
];

export function RankClimbDemo({ labels: partial }: { labels?: Partial<RankClimbLabels> }) {
  const labels = { ...DEFAULT_LABELS, ...partial };
  const reduce = useReducedMotion();
  const [order, setOrder] = useState<Pin[]>(() => initialOrder(labels.you));
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [pinging, setPinging] = useState(false);
  const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avgRank = useMotionValue(4);
  const visibility = useMotionValue(12);
  const avgRankRounded = useTransform(avgRank, (v) => Math.round(v).toString());
  const visibilityRounded = useTransform(visibility, (v) => `${Math.round(v)} %`);

  useEffect(() => {
    return () => {
      if (pingTimer.current) clearTimeout(pingTimer.current);
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, []);

  const reset = () => {
    setRunning(false);
    setHasRun(false);
    setPinging(false);
    setOrder(initialOrder(labels.you));
    animate(avgRank, 4, { duration: 0.4, ease: easeAdamant });
    animate(visibility, 12, { duration: 0.4, ease: easeAdamant });
    if (pingTimer.current) clearTimeout(pingTimer.current);
    if (doneTimer.current) clearTimeout(doneTimer.current);
  };

  const run = () => {
    if (running) return;
    if (hasRun) {
      reset();
      return;
    }
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

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-line px-5 py-3">
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-4 py-2 text-sm font-semibold text-navy-900 transition-[background-color,transform] hover:bg-brand-400 active:scale-[0.99] disabled:opacity-60"
        >
          {running ? labels.running : hasRun ? labels.replay : labels.run}
        </button>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-pill border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-brand-300 hover:text-navy-800"
        >
          {labels.reset}
        </button>
      </div>

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
                  <PinMarker rank={idx + 1} label={p.name} reviews={p.reviews} you={p.you} />
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

          <div className="flex items-center gap-2.5 border-t border-line pt-4 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted">
            <span className={"h-2 w-2 rounded-full " + (running ? "bg-brand-500" : "bg-navy-300")} aria-hidden />
            <AnimatePresence mode="wait">
              <motion.span
                key={running ? "r" : "i"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={running ? "text-brand-accent" : ""}
              >
                {running ? labels.rank1Firing : labels.idleAwaiting}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function MapCanvas() {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 36%, transparent 42px, color-mix(in srgb, var(--color-navy-400) 24%, transparent) 42.5px, transparent 43.5px)," +
            "radial-gradient(circle at 50% 36%, transparent 78px, color-mix(in srgb, var(--color-navy-400) 20%, transparent) 78.5px, transparent 79.5px)," +
            "radial-gradient(circle at 50% 36%, transparent 124px, color-mix(in srgb, var(--color-navy-400) 16%, transparent) 124.5px, transparent 125.5px)," +
            "radial-gradient(circle at 50% 36%, transparent 180px, color-mix(in srgb, var(--color-navy-400) 13%, transparent) 180.5px, transparent 181.5px)," +
            "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--color-navy-400) 26%, transparent) 1px, transparent 1.4px)",
          backgroundSize: "auto, auto, auto, auto, 22px 22px",
        }}
      />
      <div aria-hidden className="absolute left-1/2 top-[36%] -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-3 w-3">
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-navy-400/60" />
          <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-navy-400/60" />
        </div>
      </div>
    </>
  );
}

function PinMarker({
  rank,
  label,
  reviews,
  you,
}: {
  rank: number;
  label: string;
  reviews: string;
  you?: boolean;
}) {
  const active = you && rank === 1;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span
        className={
          "grid place-items-center rounded-lg text-sm font-semibold shadow-card ring-1 " +
          (active
            ? "bg-brand-500 text-navy-900 ring-brand-600"
            : you
              ? "bg-surface text-navy-800 ring-brand-300"
              : "bg-surface text-muted ring-line")
        }
        style={{ width: 36, height: 36 }}
      >
        {rank}
      </span>
      <span
        className={
          "mt-1 inline-block max-w-[128px] truncate rounded border px-1.5 py-[2px] text-center text-[9.5px] font-semibold uppercase tracking-[0.14em] " +
          (you ? "border-brand-300 bg-surface text-navy-800" : "border-line bg-surface/80 text-muted")
        }
      >
        {you ? label : reviews}
      </span>
    </div>
  );
}

function Stat({
  label,
  before,
  current,
  prefix = "",
  after,
  target,
}: {
  label: string;
  before: string;
  current: ReturnType<typeof useTransform<number, string>>;
  prefix?: string;
  after: string;
  target: string;
}) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</dt>
      <dd className="mt-2 flex items-baseline gap-3 text-lg text-muted">
        <span className="tnum">{before}</span>
        <span aria-hidden>→</span>
        <span className="tnum text-3xl font-semibold leading-none tracking-tight text-brand-accent">
          {prefix}
          <motion.span>{current}</motion.span>
        </span>
        <span className="tnum ml-auto text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {target} {after}
        </span>
      </dd>
    </div>
  );
}
