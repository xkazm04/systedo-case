"use client";

import { useEffect, useRef, useState } from "react";
import type { AiResponse } from "@/lib/ai-types";
import { CLAUDE_TIMEOUT_MS } from "@/lib/llm/models";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    errorGeneric: "Něco se pokazilo.",
    errorTimeout: "Model neodpověděl do {n} sekund.",
    errorNetwork: "Nepodařilo se spojit se serverem.",
  },
  en: {
    errorGeneric: "Something went wrong.",
    errorTimeout: "The model did not respond within {n} seconds.",
    errorNetwork: "Could not reach the server.",
  },
} as const;

type Status = "idle" | "loading" | "done" | "error";

/** localStorage key for a tool's last result, so it survives a refresh / tab switch. */
const resultKey = (mode: string) => `systedo.ai.result.${mode}`;

/** Bump when the persisted AiResponse shape changes, so a stale entry from a
 *  previous deploy is dropped on restore instead of rendered against missing fields. */
const RESULT_SCHEMA_VERSION = 1;
interface StoredResult<T> {
  v: number;
  savedAt: number;
  payload: AiResponse<T>;
}

/** Hard ceiling: if the model hasn't answered in time, abort and show a timeout.
 *  Environment-aware, because the two providers have very different latency:
 *   - production (Gemini) answers in a few seconds → a tight 60s ceiling is plenty.
 *   - development (Claude Code CLI: cold spawn + medium thinking) routinely needs
 *     50–90s, so the client must wait at least as long as the server's per-call cap
 *     (CLAUDE_TIMEOUT_MS) plus transfer margin. A flat 60s here aborted heavier
 *     tools (content brief, article draft) at 60s even though the server returned a
 *     real result — silently blocking the brief→article-draft loop. The dev ceiling
 *     tracks CLAUDE_TIMEOUT_MS so bumping the server cap moves the client with it. */
export const AI_TIMEOUT_MS =
  process.env.NODE_ENV === "production" ? 60_000 : CLAUDE_TIMEOUT_MS + 30_000;
/** Visual target for the loading timer — about when the response usually arrives.
 *  Dev Claude is much slower than prod Gemini, so the timer paces differently. */
export const AI_TIMER_TARGET_MS = process.env.NODE_ENV === "production" ? 18_000 : 50_000;
/** The hard ceiling in whole seconds, for user-facing copy. */
export const AI_TIMEOUT_SECONDS = Math.round(AI_TIMEOUT_MS / 1000);

/** Shared request lifecycle for every AI tool: posts {mode, ...payload} to the
 *  single /api/ai endpoint, tracks status/data/error, and aborts after the ceiling. */
export function useAiTool<T>(mode: string) {
  const t = useT(T);
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<AiResponse<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // The live request's controller + a monotonic run id, so reset()/a new run() can
  // abort an in-flight call and a late response from a superseded run can't clobber
  // newer state. Refs, not state — mutating them must not trigger a re-render.
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  // Restore the last result for this tool on mount, so a refresh or a switch to
  // another tab and back doesn't throw away a generation the user paid for.
  // Hydrating from localStorage after mount is a valid external-store sync; doing
  // it in an effect (rather than a lazy useState initializer) is what keeps the
  // server render and the first client render identical, so the set-state-in-effect
  // rule is suppressed deliberately for the two restore calls below.
  useEffect(() => {
    let restored: AiResponse<T> | null = null;
    try {
      const raw = window.localStorage.getItem(resultKey(mode));
      if (raw) {
        const stored = JSON.parse(raw) as Partial<StoredResult<T>>;
        // Only restore a result whose schema version matches — after a deploy that
        // changed AiResponse, a blind cast would render against missing fields.
        if (stored && stored.v === RESULT_SCHEMA_VERSION && stored.payload) {
          restored = stored.payload;
        } else {
          window.localStorage.removeItem(resultKey(mode));
        }
      }
    } catch {
      /* corrupt or unavailable storage — start fresh */
    }
    if (restored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(restored);
      setStatus("done");
    }
  }, [mode]);

  async function run(payload: Record<string, unknown>) {
    // Abort any in-flight request and claim a new run id, so an earlier (slower)
    // run can't resolve later and overwrite this one's state.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runIdRef.current;
    const isStale = () => runId !== runIdRef.current;

    setStatus("loading");
    setError(null);
    setTimedOut(false);

    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, ...payload }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (isStale()) return; // a newer run() (or reset) superseded this one
      if (!res.ok) {
        setError(json?.error ?? t("errorGeneric"));
        setStatus("error");
        return;
      }
      setData(json as AiResponse<T>);
      setStatus("done");
      try {
        const stored: StoredResult<T> = {
          v: RESULT_SCHEMA_VERSION,
          savedAt: Date.now(),
          payload: json as AiResponse<T>,
        };
        window.localStorage.setItem(resultKey(mode), JSON.stringify(stored));
      } catch {
        /* over quota / unavailable — keep the in-memory result, just don't persist */
      }
    } catch {
      if (isStale()) return; // a reset()/newer run aborted this one — not a real failure
      if (controller.signal.aborted) {
        setTimedOut(true);
        setError(t("errorTimeout", { n: AI_TIMEOUT_SECONDS }));
      } else {
        setError(t("errorNetwork"));
      }
      setStatus("error");
    } finally {
      clearTimeout(timer);
    }
  }

  function reset() {
    // Abort an in-flight request and bump the run id so its late resolution is
    // ignored (and doesn't surface as a spurious timeout).
    controllerRef.current?.abort();
    runIdRef.current += 1;
    setStatus("idle");
    setError(null);
    setTimedOut(false);
    setData(null);
    try {
      window.localStorage.removeItem(resultKey(mode));
    } catch {
      /* unavailable storage — nothing to clear */
    }
  }

  return { status, data, error, timedOut, run, reset };
}
