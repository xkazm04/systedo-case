"use client";

/** One row of the work queue. The SLA state is the row's loudest signal — a
 *  breached row wears a coral left rail and a filled countdown chip, everything
 *  else stays quiet — because the queue's whole job is to make "what is being
 *  lost" legible at a glance rather than pretty. */
import { Button, Pill } from "@/components/ui";
import { Clock } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { interactiveRowProps } from "@/lib/a11y/rowActivation";
import { sourceLabel } from "@/lib/leads/aggregate";
import type { Contact } from "@/lib/leads/types";
import type { SlaPhase } from "@/lib/leads/sla";

const T = {
  cs: {
    over: "+{n} min po SLA",
    left: "zbývá {n} min",
    settled: "odpovězeno",
    reply: "Odpovědět dvojníkem",
    advance: "Posunout fázi",
    open: "Otevřít {name}",
    unnamed: "Neznámý kontakt",
    sampleNote: "Ukázkový kontakt — akce jsou vypnuté.",
  },
  en: {
    over: "+{n} min past SLA",
    left: "{n} min left",
    settled: "answered",
    reply: "Reply with the twin",
    advance: "Move stage",
    open: "Open {name}",
    unnamed: "Unnamed contact",
    sampleNote: "Sample contact — actions are off.",
  },
} as const;

const PHASE_ROW: Record<SlaPhase, string> = {
  breached: "border-l-[3px] border-l-coral-500 bg-coral-soft/40",
  warning: "border-l-[3px] border-l-coral-400",
  ontrack: "",
  settled: "",
};

export default function LeadQueueRow({
  contact,
  phase,
  remainingMin,
  pending,
  stageLabel,
  live,
  onOpen,
  onReply,
  onAdvance,
}: {
  contact: Contact;
  phase: SlaPhase;
  remainingMin: number;
  /** the clock has not ticked yet (first paint) — render a placeholder countdown */
  pending: boolean;
  stageLabel: string;
  live: boolean;
  onOpen: () => void;
  onReply: () => void;
  onAdvance: () => void;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const name = contact.name ?? contact.email ?? contact.phone ?? t("unnamed");
  const company = contact.companyName ? ` · ${contact.companyName}` : "";
  const countdown = pending
    ? "—"
    : phase === "settled"
      ? t("settled")
      : remainingMin < 0
        ? t("over", { n: fmt.fmtInt(Math.abs(remainingMin)) })
        : t("left", { n: fmt.fmtInt(remainingMin) });

  return (
    <li className={`px-5 py-4 ${PHASE_ROW[phase]}`}>
      <div className="flex flex-wrap items-center gap-4">
        <span
          className={`tnum inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold ${
            phase === "breached"
              ? "bg-coral-500 text-white"
              : phase === "warning"
                ? "bg-coral-soft text-coral-600"
                : "bg-navy-50 text-muted"
          }`}
        >
          <Clock width={13} height={13} />
          {countdown}
        </span>

        <div
          {...interactiveRowProps(onOpen, t("open", { name }))}
          className="min-w-0 flex-1 cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-navy-800">
              {name}
              {company}
            </span>
            {contact.score && <Pill tone="brand">{contact.score.grade}</Pill>}
            <Pill tone="navy">{stageLabel}</Pill>
            <span className="text-xs text-muted">{sourceLabel(contact.attribution)}</span>
          </div>
          {contact.notes && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{contact.notes}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onAdvance} disabled={!live}>
            {t("advance")}
          </Button>
          <Button size="sm" onClick={onReply}>
            {t("reply")}
          </Button>
        </div>
      </div>
      {!live && <p className="mt-2 text-[11px] text-muted">{t("sampleNote")}</p>}
    </li>
  );
}
