"use client";

import { useRef, useState } from "react";
import {
  planStageSelection,
  stageRequestBody,
  type ChangeSetPreview,
  type StageRow,
} from "@/lib/campaigns/stage-selection";

/** What the page hands the table so a selection can be staged. Absent for anonymous
 *  visitors (the control-plane route is signed-in only), and then no row is selectable. */
export interface StageContext {
  projectId?: string;
  /** campaign id → a stageable critical alert naming it */
  alertByCampaign: ReadonlyMap<string, string>;
  /** the tenant's `SyncMeta.source`, for rows that carry no row-level stamp */
  fallbackSource?: string;
  /** a set was staged: reload the console and reveal it */
  onStaged: () => void;
}

export type StageError = { kind: "stale" } | { kind: "server"; message?: string };

/** Row selection → a no-write preview of the ONE scoped change-set → a stage that
 *  persists exactly what was previewed (the preview's `basis` pins it; a sync in
 *  between answers 409 and the preview is dropped).
 *
 *  The selection is record-keyed and survives filtering; `planStageSelection` reads
 *  it against the rows the filter shows. A preview is kept against the plan it was
 *  built for, so changing the selection or the filter hides it and Stage needs a
 *  fresh one. The single-request guard lives in the HANDLER (a ref), not only on the
 *  disabled button: a double click lands twice before React re-renders `disabled`,
 *  and two stages would be two pending sets. */
export function useStageSelection(rows: readonly StageRow[], visible: readonly StageRow[], ctx?: StageContext) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [preview, setPreview] = useState<{ key: string; data: ChangeSetPreview } | null>(null);
  const [busy, setBusy] = useState<"preview" | "stage" | null>(null);
  const [error, setError] = useState<StageError | null>(null);
  const inFlight = useRef(false);

  const plan = planStageSelection(
    rows,
    selected,
    visible.map((r) => r.id),
    { fallbackSource: ctx?.fallbackSource }
  );
  const key = `${plan.network ?? ""}|${plan.payloadIds.join(",")}`;
  const current = preview && preview.key === key ? preview.data : null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  };
  const clear = () => {
    setSelected(new Set());
    setPreview(null);
    setError(null);
  };

  const run = async (kind: "preview" | "stage", body: (c: StageContext) => Promise<void>) => {
    if (!ctx || inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    try {
      await body(ctx);
    } catch {
      setError({ kind: "server" });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/campaigns/control-plane", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: unknown;
      preview?: ChangeSetPreview;
    };
    const message = typeof json.error === "string" ? json.error : undefined;
    return { res, json, message };
  };

  const previewSelection = () =>
    run("preview", async (c) => {
      if (!plan.canPreview) return;
      const { res, json, message } = await post(stageRequestBody(plan, "preview", c));
      if (!res.ok || !json.preview) return setError({ kind: "server", message });
      setPreview({ key, data: json.preview });
    });

  const stageSelection = () =>
    run("stage", async (c) => {
      if (!plan.canStage || !current) return;
      const { res, message } = await post(stageRequestBody(plan, "create", { ...c, basis: current.basis }));
      if (res.status === 409) {
        setPreview(null);
        return setError({ kind: "stale" });
      }
      if (!res.ok) return setError({ kind: "server", message });
      clear();
      c.onStaged();
    });

  return {
    enabled: Boolean(ctx),
    selected,
    plan,
    preview: current,
    busy,
    error,
    toggle,
    clear,
    previewSelection,
    stageSelection,
  };
}

export type StageSelection = ReturnType<typeof useStageSelection>;
