"use client";

/** KRAJINA — the lead landscape (aggregate overview, direction F).
 *
 *  One canvas, two altitudes. At overview altitude it draws CLUSTERS along a
 *  switchable axis (source / stage / region / owner), sized by count with a
 *  stage-mix ring; zooming in (scrubber, wheel, or a click) expands ONE cluster
 *  into individual dots — radial position = age, colour = SLA phase.
 *
 *  The scaling rule this direction exists for: the overview is the aggregate the
 *  module already handed us, and an expansion fetches only that cluster's members
 *  through `/crm/landscape`, capped at `POINT_CAP`. No screen here ever loads the
 *  whole contact set. Node budget: ≤ CLUSTER_CAP circles + ≤ POINT_CAP dots (one
 *  expanded cluster at a time) — comfortably inside the ~1 000 live SVG nodes this
 *  prototype is bounded to; beyond that this direction needs WebGL, which is out
 *  of scope. */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionProvider } from "@/components/motion/MotionProvider";
import Segmented from "@/components/dashboard/vykon/Segmented";
import { useFormatters, useT } from "@/lib/i18n/client";
import {
  EXPAND_ZOOM,
  focusLayout,
  layoutClusters,
  LANDSCAPE_AXES,
  OWNER_UNASSIGNED,
  type LandscapeAxis,
  type LandscapePoint,
} from "@/lib/leads/landscape";
import { isPipelineStage } from "@/lib/leads/types";
import type { AggregateViewProps } from "../view-props";
import { STAGE_T } from "../copy";
import { schrankaHref } from "../handoff";
import { AXIS_T } from "./labels";
import { useAxisClusters, useClusterPoints, useMeasuredWidth } from "./useLandscape";
import LandscapeCanvas from "./LandscapeCanvas";
import LandscapeLegend from "./LandscapeLegend";
import ZoomScrubber from "./ZoomScrubber";
import SelectionBar from "./SelectionBar";
import ClosedDrawer from "./ClosedDrawer";
import ClusterList from "./ClusterList";

const HEIGHT = 620;

const T = {
  cs: {
    axis: "Shlukovat podle",
    canvas: "Krajina leadů — plátno shluků",
    you: "Vy (jediný operátor)",
    sample: "Ukázková data — projekt zatím nemá vlastní kontakty.",
    capped: "Zobrazeno prvních {n} kontaktů projektu, ne celá databáze.",
    other: "Mimo plátno: {groups} menších skupin ({n} kontaktů).",
    unplaced: "{n} kontaktů nemá lokalitu — v regionální krajině nejsou.",
    empty: "Pro tuto osu zatím nejsou žádná data.",
    loading: "Načítám krajinu…",
    fallback: "Poptávka z krajiny leadů.",
  },
  en: {
    axis: "Cluster by",
    canvas: "Lead landscape — cluster canvas",
    you: "You (single operator)",
    sample: "Sample data — the project has no contacts of its own yet.",
    capped: "Showing the project's first {n} contacts, not the whole database.",
    other: "Off canvas: {groups} smaller groups ({n} contacts).",
    unplaced: "{n} contacts have no location — they are absent from the region landscape.",
    empty: "No data for this axis yet.",
    loading: "Loading the landscape…",
    fallback: "Enquiry from the lead landscape.",
  },
} as const;

export default function LandscapeView({ projectId, summary, live, onOpenInTable }: AggregateViewProps) {
  const t = useT(T);
  const axisLabel = useT(AXIS_T);
  const stageLabel = useT(STAGE_T);
  const { fmtInt } = useFormatters();
  const router = useRouter();

  const [axis, setAxis] = useState<LandscapeAxis>("source");
  const [zoom, setZoom] = useState(0);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [lasso, setLasso] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);

  const boxRef = useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(boxRef);
  const box = useMemo(() => ({ width, height: HEIGHT }), [width]);

  const state = useAxisClusters(projectId, axis, summary);
  const clusters = useMemo(() => state.set?.clusters ?? [], [state.set]);
  const pointsState = useClusterPoints(projectId, axis, focusKey);

  const placed = useMemo(() => layoutClusters(clusters, box), [clusters, box]);
  const focused = useMemo(() => focusLayout(placed, focusKey, zoom, box), [placed, focusKey, zoom, box]);
  const pointOpacity = Math.max(0, Math.min(1, (zoom - EXPAND_ZOOM) / (1 - EXPAND_ZOOM)));

  const labelOf = (key: string) => {
    if (axis === "stage" && isPipelineStage(key)) return stageLabel(key);
    if (axis === "owner" && key === OWNER_UNASSIGNED) return t("you");
    return key;
  };

  const expand = (key: string) => {
    setFocusKey(key);
    setSelection([]);
    setZoom((z) => Math.max(z, 0.85));
  };

  /** The scrubber is the semantic altitude control: crossing the threshold upward
   *  with nothing focused picks the biggest cluster (the one the operator is
   *  almost certainly zooming toward); dropping to the floor returns to overview. */
  const changeZoom = (z: number) => {
    setZoom(z);
    if (z <= 0.02) {
      setFocusKey(null);
      setSelection([]);
    } else if (z > EXPAND_ZOOM && !focusKey && clusters[0]) {
      setFocusKey(clusters[0].key);
    }
  };

  const selected = pointsState.points.filter((p) => selection.includes(p.id));
  const openPoint = (p: LandscapePoint) =>
    onOpenInTable(p.name ? { search: p.name } : { stage: p.stage });
  const replyPoint = async (p: LandscapePoint) => {
    const { seedReplyForPoint } = await import("./reply");
    await seedReplyForPoint(projectId, p, t("fallback"));
    router.push(schrankaHref(projectId));
  };

  return (
    <MotionProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">{t("axis")}</span>
            <Segmented<LandscapeAxis>
              ariaLabel={t("axis")}
              value={axis}
              onChange={(a) => {
                setAxis(a);
                setFocusKey(null);
                setSelection([]);
                setZoom(0);
              }}
              options={LANDSCAPE_AXES.map((a) => ({ value: a, label: axisLabel(a) }))}
            />
          </div>
          <ZoomScrubber
            zoom={zoom}
            onZoom={changeZoom}
            lasso={lasso}
            onLasso={setLasso}
            lassoDisabled={pointOpacity <= 0.01}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LandscapeLegend />
          {!live && <span className="text-xs text-muted">{t("sample")}</span>}
          {state.capped && summary && (
            <span className="tnum text-xs text-muted">{t("capped", { n: fmtInt(summary.scanned) })}</span>
          )}
        </div>

        <div ref={boxRef}>
          {clusters.length === 0 ? (
            <div className="rounded-card border border-line bg-surface p-6 text-xs text-muted">
              {state.loading ? t("loading") : t("empty")}
            </div>
          ) : (
            <LandscapeCanvas
              placed={focused}
              box={box}
              labelOf={labelOf}
              ariaLabel={t("canvas")}
              focusKey={focusKey}
              points={pointsState.points}
              pointOpacity={pointOpacity}
              selection={new Set(selection)}
              lasso={lasso}
              onExpand={expand}
              onSelection={setSelection}
              onOpen={openPoint}
              onReply={(p) => void replyPoint(p)}
              onWheelZoom={(d) => changeZoom(Math.max(0, Math.min(1, zoom - d * 0.0012)))}
            />
          )}
        </div>

        <SelectionBar points={selected} onOpenInTable={onOpenInTable} onClear={() => setSelection([])} />

        {state.set && state.set.other.groups > 0 && (
          <p className="tnum text-xs text-muted">
            {t("other", { groups: fmtInt(state.set.other.groups), n: fmtInt(state.set.other.count) })}
          </p>
        )}
        {axis === "region" && state.set && state.set.unplaced > 0 && (
          <p className="tnum text-xs text-muted">{t("unplaced", { n: fmtInt(state.set.unplaced) })}</p>
        )}

        <ClusterList
          clusters={clusters}
          labelOf={labelOf}
          focusKey={focusKey}
          points={pointsState.points}
          truncated={pointsState.truncated}
          loading={pointsState.loading}
          onExpand={expand}
          onOpen={openPoint}
          onReply={(p) => void replyPoint(p)}
        />

        <ClosedDrawer summary={summary} onOpenInTable={onOpenInTable} />
      </div>
    </MotionProvider>
  );
}
