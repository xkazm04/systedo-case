"use client";

import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { useProject } from "@/lib/projects/context";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: { nextSteps: "Další kroky" },
  en: { nextSteps: "Next steps" },
} as const;

export interface NextStep {
  /** target module key under /app/[projectId]/ */
  to: string;
  label: string;
  hint: string;
}

/** A "next steps" strip that links a module to its downstream module(s) — the
 *  visible wiring that turns the modules into connected flows (e.g. Zisk →
 *  Kampaně, Obsah → Distribuce → Sociální sítě). Reads the active project from
 *  context, so it drops into any module (client or server) without a prop. */
export default function NextSteps({ steps }: { steps: NextStep[] }) {
  const project = useProject();
  const t = useT(T);
  if (steps.length === 0) return null;
  return (
    <div>
      <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{t("nextSteps")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {steps.map((s) => (
          <Link
            key={s.to + s.label}
            href={`/app/${project.id}/${s.to}`}
            className="card group flex items-center justify-between gap-3 p-4 transition-colors hover:border-brand-300"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-navy-800">{s.label}</span>
              <span className="block truncate text-xs text-muted">{s.hint}</span>
            </span>
            <ArrowRight
              width={18}
              height={18}
              className="shrink-0 text-brand-accent transition-transform group-hover:translate-x-1"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
