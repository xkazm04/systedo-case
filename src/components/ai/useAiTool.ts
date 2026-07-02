"use client";

import { useEffect, useRef, useState } from "react";
import type { AiResponse } from "@/lib/ai-types";
import {
  parseStoredHistory,
  pushHistory,
  serializeHistory,
  type AiHistoryEntry,
} from "@/lib/ai/history";
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

/** localStorage key for a tool's generation history, so results survive a
 *  refresh / tab switch. The slot holds a bounded, newest-first list (see
 *  lib/ai/history) — a re-run appends instead of destroying the previous
 *  generation the user paid quota for. */
const resultKey = (mode: string) => `systedo.ai.result.${mode}`;

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
  // Bounded newest-first list of past generations for this tool (persisted), plus
  // which entry the panel currently shows (0 = the newest).
  const [history, setHistory] = useState<AiHistoryEntry<T>[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // The live request's controller + a monotonic run id, so reset()/a new run() can
  // abort an in-flight call and a late response from a superseded run can't clobber
  // newer state. Refs, not state — mutating them must not trigger a re-render.
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  // Mirror of `history` for event handlers/async closures (never read in render),
  // so run()/restore() see the current list without stale-closure races.
  const historyRef = useRef<AiHistoryEntry<T>[]>([]);

  const commitHistory = (next: AiHistoryEntry<T>[]) => {
    historyRef.current = next;
    setHistory(next);
  };

  // Restore this tool's generation history on mount, so a refresh or a switch to
  // another tab and back doesn't throw away generations the user paid for.
  // Hydrating from localStorage after mount is a valid external-store sync; doing
  // it in an effect (rather than a lazy useState initializer) is what keeps the
  // server render and the first client render identical, so the set-state-in-effect
  // rule is suppressed deliberately for the restore calls below.
  useEffect(() => {
    let entries: AiHistoryEntry<T>[] = [];
    try {
      const raw = window.localStorage.getItem(resultKey(mode));
      entries = parseStoredHistory<T>(raw);
      // A slot that exists but yields nothing is stale (schema bump) or corrupt.
      if (raw && entries.length === 0) window.localStorage.removeItem(resultKey(mode));
    } catch {
      /* corrupt or unavailable storage — start fresh */
    }
    historyRef.current = entries;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(entries);
    if (entries.length > 0) {
      setData(entries[0].payload);
      setStatus("done");
      setActiveIndex(0);
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
      setActiveIndex(0);
      const next = pushHistory(historyRef.current, {
        savedAt: Date.now(),
        payload: json as AiResponse<T>,
      });
      commitHistory(next);
      try {
        window.localStorage.setItem(resultKey(mode), serializeHistory(next));
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

  /** Show a previous generation from the history strip. Pure state switch — no
   *  request, no quota. Aborts an in-flight run so a late response can't clobber
   *  the restored entry. */
  function restore(index: number) {
    const entry = historyRef.current[index];
    if (!entry) return;
    controllerRef.current?.abort();
    runIdRef.current += 1;
    setData(entry.payload);
    setStatus("done");
    setActiveIndex(index);
    setError(null);
    setTimedOut(false);
  }

  function reset() {
    // Abort an in-flight request and bump the run id so its late resolution is
    // ignored (and doesn't surface as a spurious timeout). The persisted history
    // deliberately survives a reset — reset is the error-retry path, and wiping
    // past generations there would destroy exactly what the history protects.
    controllerRef.current?.abort();
    runIdRef.current += 1;
    setStatus("idle");
    setError(null);
    setTimedOut(false);
    setData(null);
  }

  return { status, data, error, timedOut, run, reset, history, activeIndex, restore };
}
