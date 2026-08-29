/** The shared "Needs attention" feed — a single project's recommendations, or the
 *  combined cross-project feed (when `showProject`, each row names its project).
 *
 *  Extracted from ProjectOverview in WP W3-A so the ledger affordances (the dismiss
 *  filter, the "sledováno od" hint, the outcome section) have a home that is not the
 *  overview page's own module. Server component.
 *
 *  THE LEDGER IS OPTIONAL, ALWAYS. `ledger` is null for the public demo dashboard and
 *  for the portfolio feed, and every ledger-derived affordance degrades to exactly the
 *  pre-W3-A rendering when it is — the feed is the product, the ledger is an
 *  observation of it. */
import Link from "next/link";
import AdviceOutcomes from "@/components/app/overview/AdviceOutcomes";
import { Pill } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import type { Severity } from "@/lib/insights/types";
import type { PortfolioRec } from "@/components/app/overview/portfolio-model";
import {
  adviceRecordFor,
  dismissedSubjectKeys,
  recentAdviceOutcomes,
  type AdviceLedger,
} from "@/lib/advice/ledger";
import { getServerFormatters, getT } from "@/lib/i18n/server";

const T = {
  cs: {
    needsAttention: "Vyžaduje pozornost",
    allGood: "Vše vypadá v pořádku: žádná upozornění napříč projekty.",
    priority: "Priorita",
    sampleBadge: "Ukázková data",
    sampleHint:
      "Toto doporučení vychází z ilustrativních dat, ne z vašeho importu. Po napojení zdroje v modulu se přepočítá na reálná čísla.",
    seenSince: "Sledováno od {date} · zobrazeno {n}×",
  },
  en: {
    needsAttention: "Needs attention",
    allGood: "Everything looks good: no alerts across projects.",
    priority: "Priority",
    sampleBadge: "Sample data",
    sampleHint:
      "This recommendation runs on illustrative data, not your import. Connect the source in the module and it recomputes on real numbers.",
    seenSince: "Tracked since {date} · shown {n}×",
  },
} as const;

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-negative",
  warning: "bg-coral-500",
  opportunity: "bg-positive",
  info: "bg-navy-300",
};

export default async function NeedsAttention({
  recs,
  count,
  moduleHref,
  showProject,
  ledger = null,
  now = new Date(),
}: {
  recs: PortfolioRec[];
  count: number;
  moduleHref: (projectId: string, moduleKey: string) => string;
  showProject: boolean;
  /** the project's advice ledger, when this feed belongs to ONE project */
  ledger?: AdviceLedger | null;
  now?: Date;
}) {
  const t = await getT(T);
  const fmt = await getServerFormatters();

  // A dismissed subject stops rendering but stays in the ledger — the operator said
  // "not this one", not "forget this ever happened", and its history still counts
  // toward an outcome if the signal later goes quiet.
  const dismissed = dismissedSubjectKeys(ledger);
  const visible = dismissed.size > 0 ? recs.filter((r) => !dismissed.has(r.subjectKey)) : recs;
  const shown = count - (recs.length - visible.length);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
          {t("needsAttention")}
        </h3>
        {shown > 0 && <Pill tone="neutral">{shown}</Pill>}
      </div>
      {visible.length === 0 ? (
        <div className="mt-3 flex items-center gap-3 rounded-card border border-line bg-canvas px-4 py-4 text-sm text-muted">
          <span className="h-2 w-2 rounded-full bg-positive" aria-hidden />
          {t("allGood")}
        </div>
      ) : (
        <div className="mt-3 card divide-y divide-line overflow-hidden">
          {visible.map((r, i) => {
            // How long this exact subject has been on the list — a row the operator
            // has been shown eleven times reads differently from a brand-new one.
            const tracked = adviceRecordFor(ledger, r.subjectKey);
            return (
            <Link
              key={r.id}
              href={moduleHref(r.projectId, r.module)}
              className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-navy-50"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[r.severity]}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    {i < 3 && (
                      <span className="shrink-0 rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-accent">
                        {t("priority")} {i + 1}
                      </span>
                    )}
                    {showProject && (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-pill bg-canvas px-2 py-0.5 text-[11px] font-medium text-navy-700">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: r.projectAccent }}
                          aria-hidden
                        />
                        {r.projectName}
                      </span>
                    )}
                    {/* Provenance, not decoration: a rec derived from seeded sample
                        signals says so, using the SAME "Ukázková data" chip the
                        module pages carry (SampleDataNote / ModulePage's `sample`
                        gutter). Tagged rather than suppressed — see the commit note. */}
                    {r.sample && (
                      <span className="shrink-0" title={t("sampleHint")}>
                        <Pill tone="navy">{t("sampleBadge")}</Pill>
                      </span>
                    )}
                    <span
                      className="text-sm font-semibold text-navy-800"
                      title={
                        tracked
                          ? t("seenSince", {
                              date: fmt.fmtDate(tracked.firstSeenAt.slice(0, 10)),
                              n: tracked.timesSeen,
                            })
                          : undefined
                      }
                    >
                      {r.title}
                    </span>
                  </span>
                  {r.metric && (
                    <span className="tnum shrink-0 text-xs font-medium text-muted">{r.metric}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted">{r.detail}</span>
                <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-accent">
                  {r.moduleLabel}
                  <ArrowRight width={13} height={13} />
                </span>
              </span>
            </Link>
            );
          })}
        </div>
      )}
      <AdviceOutcomes records={recentAdviceOutcomes(ledger, now)} />
    </div>
  );
}
