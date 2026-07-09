"use client";

/** The twin's persisted blob, shared by the three modules that edit it: Twin
 *  (trains the voice), Správa kanálů (autonomy + connectors) and Schránka zpráv
 *  (the draft outbox).
 *
 *  Each module is its own route, so each mounts this hook with the state its
 *  server page resolved. Persistence is fire-and-forget — a demo project (or a
 *  failed save) simply keeps the state in memory, the same graceful-degradation
 *  contract the other demo-capable modules use. Splitting the twin into three
 *  routes is exactly why this lives here and not in a component: a `commit` that
 *  drifted between them would let one module's save clobber another's. */
import { useState } from "react";
import { useProject } from "@/lib/projects/context";
import type { TwinState } from "@/lib/twin/types";

export type TwinSource = "sample" | "trained";

export function useTwinState(initialState: TwinState, initialSource: TwinSource) {
  const project = useProject();
  const [state, setState] = useState<TwinState>(initialState);
  const [source, setSource] = useState<TwinSource>(initialSource);
  const [resetting, setResetting] = useState(false);

  /** Replace the twin and persist it. The server re-sanitizes the whole blob. */
  const commit = (next: TwinState) => {
    setState(next);
    setSource("trained");
    void fetch(`/api/projects/${project.id}/twin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {});
  };

  /** Untrain: back to the seeded per-type sample, empty outbox. */
  const untrain = () => {
    setResetting(true);
    setState(initialState);
    setSource("sample");
    void fetch(`/api/projects/${project.id}/twin`, { method: "DELETE" })
      .catch(() => {})
      .finally(() => setResetting(false));
  };

  return { state, source, commit, untrain, resetting };
}
