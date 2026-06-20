"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Document } from "@/components/icons";
import ContentBriefGenerator from "@/components/ai/ContentBriefGenerator";
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    articleTitle: "Publikovaný článek",
    articleDesc: "Ukázka výsledné stránky — struktura, prolinkování, FAQ a strukturovaná data.",
  },
  en: {
    articleTitle: "Published article",
    articleDesc: "Preview of the result page — structure, internal links, FAQ and structured data.",
  },
} as const;

/** Content module = the AI content-brief tool, seeded from the keyword module
 *  when the user arrived via "Create brief", plus a pointer to the published
 *  article surface so the loop (brief → published article) is visible. */
export default function ContentModule() {
  const project = useProject();
  const t = useT(T);
  const [seed, setSeed] = useState<BriefSeed | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(briefSeedKey(project.id));
      if (raw) {
        // One-shot read of an external store (sessionStorage) on mount to seed the
        // form. Deliberately an effect rather than a render-time read so the server
        // and first client paint agree (no hydration mismatch); the rule's
        // cascading-render caveat doesn't apply to this single set.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSeed(JSON.parse(raw) as BriefSeed);
        sessionStorage.removeItem(briefSeedKey(project.id));
      }
    } catch {
      /* ignore malformed/absent seed */
    }
  }, [project.id]);

  return (
    <div className="space-y-8">
      <ContentBriefGenerator seed={seed} />

      <Link
        href="/clanek"
        className="card group flex items-center gap-4 p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-accent transition-colors group-hover:bg-brand-600 group-hover:text-white">
          <Document width={22} height={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-navy-800">{t("articleTitle")}</span>
          <span className="block text-sm text-muted">{t("articleDesc")}</span>
        </span>
        <ArrowRight
          width={18}
          height={18}
          className="shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-brand-accent"
        />
      </Link>
    </div>
  );
}
