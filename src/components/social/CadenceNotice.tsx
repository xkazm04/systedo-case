"use client";

/** The operator-facing half of the cadence cap: what a 409 from the social write
 *  chokepoint looks like on screen, and the override that is always one click away.
 *
 *  THREE surfaces schedule through that chokepoint — the week planner, the
 *  content-plan board's hand-off and the Distribuce variant card — and a refusal
 *  has to read the same in all three, or the cap looks like three different bugs.
 *  So the copy, the state and the retry affordance live here once, behind a hook
 *  whose whole footprint at a call site is: capture the failed response, and render
 *  the notice with the retry that re-posts.
 *
 *  THE OVERRIDE IS A HUMAN CLICK. Nothing here retries on its own and nothing
 *  reschedules: the operator is shown the cap they set, and decides. The server
 *  writes that decision to the audit timeline (see the route's cadenceRefusal). */
import { useCallback, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { CHANNEL_KEY_LABELS } from "@/lib/publishing/channel-key";
import { parseCadenceRefusal, type CadenceRefusal } from "@/lib/publishing/refusal";

const T = {
  cs: {
    capReached: "{channel}: limit {cap}× týdně je pro tento týden vyčerpaný ({count} položek). Naplánováno nebylo nic.",
    anyway: "Naplánovat i tak",
    dismiss: "Zavřít",
  },
  en: {
    capReached: "{channel}: the cap of {cap}× a week is used up for this week ({count} items). Nothing was scheduled.",
    anyway: "Schedule anyway",
    dismiss: "Dismiss",
  },
} as const;

export function CadenceNotice({
  refusal,
  onOverride,
  onDismiss,
}: {
  refusal: CadenceRefusal;
  onOverride: () => void;
  onDismiss: () => void;
}) {
  const t = useT(T);
  return (
    <div
      role="status"
      className="mt-2 flex flex-wrap items-start gap-2 rounded-card border border-coral-500/25 bg-coral-soft px-4 py-3 text-sm text-navy-700"
    >
      <p className="min-w-0 flex-1">
        {t("capReached", {
          channel: CHANNEL_KEY_LABELS[refusal.channel],
          cap: refusal.cap,
          count: refusal.count,
        })}
      </p>
      <button
        type="button"
        onClick={onOverride}
        className="shrink-0 rounded-pill border border-coral-500/40 px-3 py-1 text-xs font-semibold text-coral-600 transition-colors hover:bg-surface"
      >
        {t("anyway")}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 px-1 py-1 text-xs font-medium text-muted transition-colors hover:text-navy-800"
      >
        {t("dismiss")}
      </button>
    </div>
  );
}

export interface CadenceGuard {
  /** Consume a FAILED response. Returns true when it WAS a cadence refusal — the notice is now
   *  showing and the caller must not also surface its own generic error. `retry` is captured
   *  alongside it and must re-run the identical request with `overrideCadence: true`; keeping it
   *  here is what lets a call site adopt the whole flow in one line instead of growing a
   *  "which request was refused" ref of its own. */
  capture: (status: number, body: unknown, retry: () => void) => boolean;
  /** The notice for the current refusal, or null. */
  notice: () => ReactNode;
}

export function useCadenceGuard(): CadenceGuard {
  const [state, setState] = useState<{ refusal: CadenceRefusal; retry: () => void } | null>(null);
  const capture = useCallback((status: number, body: unknown, retry: () => void) => {
    const refusal = parseCadenceRefusal(status, body);
    setState(refusal ? { refusal, retry } : null);
    return refusal !== null;
  }, []);
  const notice = useCallback(
    (): ReactNode =>
      state ? (
        <CadenceNotice
          refusal={state.refusal}
          onOverride={() => {
            setState(null);
            state.retry();
          }}
          onDismiss={() => setState(null)}
        />
      ) : null,
    [state]
  );
  return { capture, notice };
}
