"use client";

import { useState } from "react";
import type { AiResponse } from "@/lib/ai-types";

type Status = "idle" | "loading" | "done" | "error";

/** Shared request lifecycle for every AI tool: posts {mode, ...payload} to the
 *  single /api/ai endpoint and tracks status / data / error. */
export function useAiTool<T>(mode: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<AiResponse<T> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(payload: Record<string, unknown>) {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Něco se pokazilo.");
        setStatus("error");
        return;
      }
      setData(json as AiResponse<T>);
      setStatus("done");
    } catch {
      setError("Nepodařilo se spojit se serverem.");
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
  }

  return { status, data, error, run, reset };
}
