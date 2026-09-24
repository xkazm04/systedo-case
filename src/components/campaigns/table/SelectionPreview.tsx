"use client";

import { useT } from "@/lib/i18n/client";
import { moveRowLabel } from "@/lib/campaigns/move-label";
import type { ChangeSet } from "@/lib/campaigns/control-plane-types";
import type { ChangeSetPreview } from "@/lib/campaigns/stage-selection";
import ProposalProjection, { CalibrationPill } from "../ProposalProjection";

const T = {
  cs: {
    heading: "Náhled balíčku · zatím se nic neuložilo",
    distinct: "Každého příjemce financuje jen jeden dárce: přesuny si navzájem nekonkurují.",
    violations: "Porušení limitů: {n}. Schválení bude vyžadovat výslovné potvrzení.",
  },
  en: {
    heading: "Change set preview · nothing is saved yet",
    distinct: "Each recipient is funded by one donor only, so the moves don't compete for it.",
    violations: "{n} guardrail breach(es): approving will need an explicit override.",
  },
} as const;

/** The moves ONE scoped change-set would carry, before anything is persisted: each
 *  move's row label (the same sentence the console's approval row shows), its amount,
 *  and the projection the operator will later approve. The projection block is the
 *  console's own ProposalProjection, fed the preview as the pending set it would be. */
export default function SelectionPreview({
  preview,
  money,
}: {
  preview: ChangeSetPreview;
  money: (n: number) => string;
}) {
  const t = useT(T);
  const asPending: ChangeSet = {
    ...preview,
    id: "",
    createdAt: "",
    status: "pending",
    approvedAt: null,
    revertedAt: null,
    results: null,
  };
  const recipients = preview.moves.filter((m) => m.kind !== "pause" && m.toId).map((m) => m.toId);
  const distinct = recipients.length > 1 && new Set(recipients).size === recipients.length;
  return (
    <div className="mt-3 rounded-card border border-line bg-canvas/60 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("heading")}</h4>
      <ul className="mt-2 space-y-1">
        {preview.moves.map((m, i) => (
          <li key={`${m.fromId}-${m.toId}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-navy-800">{moveRowLabel(m)}</span>
            <span className="tnum text-navy-700">{money(m.amount)}</span>
          </li>
        ))}
      </ul>
      {distinct && <p className="mt-2 text-xs text-muted">{t("distinct")}</p>}
      {preview.violations.length > 0 && (
        <p className="mt-2 text-xs font-medium text-coral-600">{t("violations", { n: preview.violations.length })}</p>
      )}
      <ProposalProjection set={asPending} money={money} />
      <CalibrationPill set={asPending} />
    </div>
  );
}
