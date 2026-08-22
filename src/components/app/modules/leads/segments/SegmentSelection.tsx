"use client";

/** The selection card: what the picked cell (or the picked source) actually
 *  contains, in facts the grid itself has no room for.
 *
 *  It carries no "open in the table" button any more — the click that selected the
 *  cell already filtered the table below and scrolled to it, so a second control
 *  for the same thing would only invite the operator to doubt whether the first one
 *  worked. The bulk-draft button stays deliberately inert: drafting to a segment
 *  goes through the twin's review gate, and this must not fake that. */
import { Button } from "@/components/ui";
import { czPlural } from "@/lib/format";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { MatrixRow } from "@/lib/leads/summary";
import { MATRIX_STAGES } from "@/lib/leads/summary";
import type { PipelineStage } from "@/lib/leads/types";
import { STAGE_T } from "../copy";

const T = {
  cs: {
    idle: "Vyberte buňku matice nebo dlaždici zdroje — uvidíte, co obsahuje, a tabulka níže se rovnou přefiltruje.",
    selected: "Vybráno: {what}",
    allStages: "všechny fáze",
    contactsOne: "{n} kontakt",
    contactsFew: "{n} kontakty",
    contactsMany: "{n} kontaktů",
    breached: "{n} po SLA",
    ab: "{p} se známkou A/B",
    win: "úspěšnost {p}",
    value: "hodnota {v}",
    terminal: "{n} prohráno / vyřazeno",
    bulk: "Hromadně: návrhy dvojníka ({n})",
    soon: "Připravujeme — hromadné návrhy půjdou přes schvalování dvojníka.",
    applied: "Filtr je použitý na tabulku níže.",
  },
  en: {
    idle: "Pick a matrix cell or a source tile — you'll see what it holds, and the table below filters to it.",
    selected: "Selected: {what}",
    allStages: "all stages",
    contactsOne: "{n} contact",
    contactsFew: "{n} contacts",
    contactsMany: "{n} contacts",
    breached: "{n} past SLA",
    ab: "{p} graded A/B",
    win: "win rate {p}",
    value: "value {v}",
    terminal: "{n} lost / disqualified",
    bulk: "Bulk: twin drafts ({n})",
    soon: "Coming soon — bulk drafts will go through the twin's approval gate.",
    applied: "The filter is applied to the table below.",
  },
} as const;

export default function SegmentSelection({
  row,
  stage,
}: {
  row: MatrixRow | null;
  /** null ⇒ the whole source is selected (a treemap tile) */
  stage: PipelineStage | null;
}) {
  const t = useT(T);
  const stageName = useT(STAGE_T);
  const fmt = useFormatters();

  if (!row) {
    return (
      <div className="card p-5">
        <p className="text-sm text-muted">{t("idle")}</p>
      </div>
    );
  }

  const cell = stage ? row.cells[stage] : null;
  const count = cell ? cell.count : row.total;
  const breached = cell
    ? cell.breached
    : MATRIX_STAGES.reduce((s, st) => s + row.cells[st].breached, 0);
  const ab = cell ? cell.ab : MATRIX_STAGES.reduce((s, st) => s + row.cells[st].ab, 0);

  const facts = [
    t(czPlural(count, "contactsOne", "contactsFew", "contactsMany"), { n: fmt.fmtInt(count) }),
    ...(breached > 0 ? [t("breached", { n: fmt.fmtInt(breached) })] : []),
    ...(count > 0 ? [t("ab", { p: fmt.fmtPct(ab / count, 0) })] : []),
    ...(cell?.value != null ? [t("value", { v: fmt.fmtCZKCompact(cell.value) })] : []),
    ...(row.winRate !== null && (stage === "won" || stage === null)
      ? [t("win", { p: fmt.fmtPct(row.winRate, 0) })]
      : []),
    ...(stage === null && row.terminal > 0 ? [t("terminal", { n: fmt.fmtInt(row.terminal) })] : []),
  ];

  return (
    <div className="card flex flex-col gap-3 p-5">
      <h3 className="text-sm font-semibold text-navy-800">
        {t("selected", { what: `${row.label} · ${stage ? stageName(stage) : t("allStages")}` })}
      </h3>
      <p className="tnum text-sm text-muted">{facts.join(" · ")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled title={t("soon")}>
          {t("bulk", { n: fmt.fmtInt(count) })}
        </Button>
      </div>
      <p className="text-xs text-muted">{t("applied")}</p>
    </div>
  );
}
