"use client";

/** RankClimbDemo's presentational parts: the contour-ring map canvas, a rank pin
 *  and a before/after readout. Split out of RankClimbDemo.tsx to keep the component
 *  under the 200-line ceiling; behaviour is unchanged. */
import { AnimatePresence, motion, type useTransform } from "framer-motion";

export function MapCanvas() {
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

export function PinMarker({
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

export function Stat({
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

export function RankClimbControls({
  running,
  runLabel,
  resetLabel,
  onRun,
  onReset,
}: {
  running: boolean;
  runLabel: string;
  resetLabel: string;
  onRun: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-line px-5 py-3">
      <button
        onClick={onRun}
        disabled={running}
        className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-4 py-2 text-sm font-semibold text-navy-900 transition-[background-color,transform] hover:bg-brand-400 active:scale-[0.99] disabled:opacity-60"
      >
        {runLabel}
      </button>
      <button
        onClick={onReset}
        className="inline-flex items-center gap-2 rounded-pill border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-brand-300 hover:text-navy-800"
      >
        {resetLabel}
      </button>
    </div>
  );
}

export function RankClimbStatus({ running, firing, idle }: { running: boolean; firing: string; idle: string }) {
  return (
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
          {running ? firing : idle}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
