"use client";

import { useEffect, useState } from "react";
import type { AiResponse } from "@/lib/ai-types";

type Status = "idle" | "loading" | "done" | "error";

/** localStorage key for a tool's last result, so it survives a refresh / tab switch. */
const resultKey = (mode: string) => `systedo.ai.result.${mode}`;

/** Hard ceiling: if the model hasn't answered in time, abort and show a timeout.
 *  Sized for the dev provider (Claude Code CLI, incl. medium thinking + cold
 *  start); Gemini in production answers well inside this. */
export const AI_TIMEOUT_MS = 60_000;
/** Visual target for the loading timer — the response usually arrives by here. */
export const AI_TIMER_TARGET_MS = 18_000;
/** The hard ceiling in whole seconds, for user-facing copy. */
export const AI_TIMEOUT_SECONDS = Math.round(AI_TIMEOUT_MS / 1000);

/** Shared request lifecycle for every AI tool: posts {mode, ...payload} to the
 *  single /api/ai endpoint, tracks status/data/error, and aborts after the ceiling. */
export function useAiTool<T>(mode: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<AiResponse<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Restore the last result for this tool on mount, so a refresh or a switch to
  // another tab and back doesn't throw away a generation the user paid for.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(resultKey(mode));
      if (raw) {
        setData(JSON.parse(raw) as AiResponse<T>);
        setStatus("done");
      }
    } catch {
      /* corrupt or unavailable storage — start fresh */
    }
  }, [mode]);

  async function run(payload: Record<string, unknown>) {
    setStatus("loading");
    setError(null);
    setTimedOut(false);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, ...payload }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Něco se pokazilo.");
        setStatus("error");
        return;
      }
      setData(json as AiResponse<T>);
      setStatus("done");
      try {
        window.localStorage.setItem(resultKey(mode), JSON.stringify(json));
      } catch {
        /* over quota / unavailable — keep the in-memory result, just don't persist */
      }
    } catch {
      if (controller.signal.aborted) {
        setTimedOut(true);
        setError(`Model neodpověděl do ${AI_TIMEOUT_SECONDS} sekund.`);
      } else {
        setError("Nepodařilo se spojit se serverem.");
      }
      setStatus("error");
    } finally {
      clearTimeout(timer);
    }
  }

  function reset() {
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
