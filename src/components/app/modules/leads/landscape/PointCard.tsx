"use client";

/** The card over a dot: who this is, and the two things an operator does about it.
 *
 *  Rendered as absolutely-positioned HTML rather than SVG so its buttons are real
 *  buttons — focusable, keyboard-activatable and styled by the shared `Button`.
 *  Positioned in container pixels, which the canvas can supply exactly because its
 *  viewBox is 1 unit = 1 px. */
import { Button } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { LandscapePoint } from "@/lib/leads/landscape";
import { STAGE_T } from "../copy";
import { SLA_T } from "./labels";

const T = {
  cs: {
    unnamed: "Bez jména",
    erased: "Smazaný kontakt (GDPR)",
    open: "Otevřít",
    reply: "Odpovědět dvojníkem",
    age: "{n} dní v systému",
    close: "Zavřít kartu",
  },
  en: {
    unnamed: "Unnamed",
    erased: "Erased contact (GDPR)",
    open: "Open",
    reply: "Reply with the twin",
    age: "{n} days in the system",
    close: "Close card",
  },
} as const;

export default function PointCard({
  point,
  x,
  y,
  boxWidth,
  onOpen,
  onReply,
  onClose,
}: {
  point: LandscapePoint;
  x: number;
  y: number;
  boxWidth: number;
  onOpen: (p: LandscapePoint) => void;
  onReply: (p: LandscapePoint) => void;
  onClose: () => void;
}) {
  const t = useT(T);
  const stage = useT(STAGE_T);
  const sla = useT(SLA_T);
  const { fmtInt } = useFormatters();
  const W = 248;
  const left = Math.max(8, Math.min(boxWidth - W - 8, x + 14));

  return (
    <div
      className="absolute z-10 w-[248px] rounded-card border border-line bg-surface p-3 shadow-pop"
      style={{ left, top: Math.max(8, y + 14) }}
      role="dialog"
      aria-label={point.name || t("unnamed")}
    >
      <p className="text-xs font-semibold text-ink">
        {point.name || t("unnamed")}
        {point.grade ? ` · ${point.grade}` : ""}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {stage(point.stage)} · {sla(point.slaPhase)}
      </p>
      <p className="tnum mt-0.5 text-xs text-muted">{t("age", { n: fmtInt(Math.round(point.ageDays)) })}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onOpen(point)}>
          {t("open")}
        </Button>
        <Button size="sm" onClick={() => onReply(point)}>
          {t("reply")}
        </Button>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="absolute right-2 top-2 rounded-pill px-1.5 text-xs text-muted hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}
