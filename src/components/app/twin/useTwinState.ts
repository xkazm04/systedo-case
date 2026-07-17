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

export function useTwinState(
  initialState: TwinState,
  initialSource: TwinSource,
  /** The seeded per-type sample — what "untrain" must reset to. Omitting it (the two
   *  modules that never untrain) leaves `untrain` falling back to `initialState`. */
  sampleState?: TwinState
) {
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

  /** Untrain: back to the seeded per-type sample, empty outbox. Resets to the SAMPLE,
   *  not `initialState` — for a twin that mounted trained, `initialState` IS the
   *  trained blob, so resetting to it left the trained voices/facts/drafts fully
   *  visible under a "Nenatrénovaný" pill AND let the next commit re-POST the
   *  supposedly-deleted blob back to the server, silently undoing the DELETE. */
  const untrain = () => {
    setResetting(true);
    setState(sampleState ?? initialState);
    setSource("sample");
    void fetch(`/api/projects/${project.id}/twin`, { method: "DELETE" })
      .catch(() => {})
      .finally(() => setResetting(false));
  };

  return { state, source, commit, untrain, resetting };
}
