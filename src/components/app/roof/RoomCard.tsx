/** One room on an area roof: the module's name and purpose, and — when the
 *  module has a summarizer — its status, one headline figure and one sentence.
 *  A module without a summarizer is a plain entry tile (ADR-0013 allows it and
 *  counts it). The whole card is one link into the room. Server component. */
import Link from "next/link";
import { ModuleIcon } from "@/components/app/icon-map";
import Provenance from "@/components/kit/Provenance";
import { moduleBlurb, moduleHref, moduleLabel, type ModuleDef } from "@/lib/projects/modules";
import { summarizeRoom, type RoomStatus } from "@/lib/projects/roof";
import type { Project } from "@/lib/projects/types";
import type { SupportedLocale } from "@/lib/format";

const STATUS: Record<RoomStatus, { en: string; cs: string; cls: string }> = {
  ok: { en: "In order", cs: "V pořádku", cls: "text-positive" },
  attention: { en: "Needs you", cs: "Čeká na vás", cls: "text-brand-accent" },
  empty: { en: "Not started", cs: "Nezačato", cls: "text-muted" },
  disconnected: { en: "Not connected", cs: "Nepřipojeno", cls: "text-muted" },
};

const SAMPLE = { en: "Sample", cs: "Ukázka" };

function Frame({ module, locale, children }: { module: ModuleDef; locale: SupportedLocale; children?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-3">
      <span className="flex items-center gap-2.5">
        <ModuleIcon icon={module.icon} width={18} height={18} className="text-muted group-hover:text-ink" />
        <span className="text-base font-semibold text-ink">{moduleLabel(module, locale)}</span>
      </span>
      <span className="text-sm text-muted">{moduleBlurb(module, locale)}</span>
      {children}
    </div>
  );
}

const CARD = "group optic-panel block h-full px-4 py-4 transition-colors hover:bg-white/[0.03]";

export function RoomCardSkeleton({ module, locale }: { module: ModuleDef; locale: SupportedLocale }) {
  return (
    <div className={CARD} aria-busy>
      <Frame module={module} locale={locale}>
        <span className="h-4 w-24 animate-pulse rounded-[2px] bg-white/[0.06]" />
      </Frame>
    </div>
  );
}

export default async function RoomCard({
  module,
  project,
  userId,
  locale,
}: {
  module: ModuleDef;
  project: Project;
  userId: string;
  locale: SupportedLocale;
}) {
  const summary = await summarizeRoom(module.key, { project, userId, locale });
  const status = summary ? STATUS[summary.status] : null;
  return (
    <Link href={moduleHref(project.id, module.key)} className={CARD}>
      <Frame module={module} locale={locale}>
        {summary ? (
          <span className="grid gap-1.5 border-t border-hair pt-3">
            <span className="flex flex-wrap items-center gap-2">
              {status ? (
                <span className={`font-mono text-xs uppercase tracking-[0.08em] ${status.cls}`}>
                  {locale === "en" ? status.en : status.cs}
                </span>
              ) : null}
              {summary.source === "sample" ? <Provenance source="sample" label={SAMPLE[locale]} /> : null}
            </span>
            {summary.metric ? (
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted">{summary.metric.label}</span>
                <span className="font-mono text-xl tabular-nums text-ink">{summary.metric.value}</span>
              </span>
            ) : null}
            {summary.note ? <span className="text-sm text-muted">{summary.note}</span> : null}
          </span>
        ) : null}
      </Frame>
    </Link>
  );
}
