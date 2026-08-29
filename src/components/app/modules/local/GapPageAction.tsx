"use client";

/** W2-C — the coverage gap's second action: turn one service×area gap into a
 *  published local landing page.
 *
 *  Flow: generate (the `local-page` tool) → preview the draft read-only → publish it
 *  as a `local-landing` microsite → link to the live /m/{slug}. Only the PROSE is
 *  sent back at publish time; service, area, price and currency are re-derived
 *  server-side from the catalog, so nothing shown here can put an invented figure on
 *  a public page.
 *
 *  Until the Director's seams commit wires the `local-page` mode into
 *  `src/app/api/ai/modes.ts`, /api/ai answers this mode with a 400 — the error branch
 *  therefore reads as "brzy" (coming soon) rather than as a failure the operator
 *  could have caused. Client. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { useAiTool } from "@/components/ai/useAiTool";
import type { LocalPageResult } from "@/lib/ai-types";

const T = {
  cs: {
    generate: "Vygenerovat stránku",
    generating: "Generuji…",
    publish: "Publikovat",
    publishing: "Publikuji…",
    view: "Otevřít stránku",
    discard: "Zahodit",
    soon: "Brzy",
    soonHint: "Generování lokální stránky se právě dokončuje.",
    preview: "Náhled konceptu",
    failed: "Publikace se nezdařila.",
  },
  en: {
    generate: "Generate page",
    generating: "Generating…",
    publish: "Publish",
    publishing: "Publishing…",
    view: "Open page",
    discard: "Discard",
    soon: "Soon",
    soonHint: "Local page generation is being finished.",
    preview: "Draft preview",
    failed: "Publishing failed.",
  },
} as const;

export default function GapPageAction({
  projectId,
  service,
  area,
}: {
  projectId: string;
  service: string;
  area: string;
}) {
  const t = useT(T);
  const router = useRouter();
  const tool = useAiTool<LocalPageResult>("local-page", `${service}|${area}`);
  const [publishing, setPublishing] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const draft = tool.data?.result ?? null;

  async function publish() {
    if (!draft) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/microsite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Prose only — every fact the page prints is re-resolved server-side.
        body: JSON.stringify({ projectId, kind: "local-landing", local: { service, area, page: draft } }),
      });
      const json = await res.json();
      if (!res.ok || !json?.microsite?.slug) {
        setPublishError(typeof json?.error === "string" ? json.error : t("failed"));
        return;
      }
      setSlug(json.microsite.slug as string);
      // The coverage matrix reads published pages live — refresh so the cell flips.
      router.refresh();
    } catch {
      setPublishError(t("failed"));
    } finally {
      setPublishing(false);
    }
  }

  if (slug) {
    return (
      <a href={`/m/${slug}`} className="text-xs font-semibold text-brand-accent hover:underline">
        {t("view")} →
      </a>
    );
  }

  // The mode is not wired yet: a failed run is reported as "coming soon", never as
  // an operator error, and the action disables itself instead of inviting a retry
  // that cannot succeed.
  if (tool.status === "error") {
    return (
      <span className="text-xs text-muted" title={t("soonHint")}>
        {t("soon")}
      </span>
    );
  }

  if (draft) {
    return (
      <div className="max-w-md space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("preview")}</p>
        <p className="text-sm font-semibold text-navy-800">{draft.headline}</p>
        <p className="line-clamp-3 text-xs text-muted">{draft.intro}</p>
        <ul className="list-inside list-disc text-xs text-navy-700">
          {draft.sections.map((s) => (
            <li key={s.heading}>{s.heading}</li>
          ))}
        </ul>
        {publishError && <p className="text-xs text-negative">{publishError}</p>}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={publish} disabled={publishing}>
            {publishing ? t("publishing") : t("publish")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => tool.reset()} disabled={publishing}>
            {t("discard")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void tool.run({ projectId, service, area })}
      disabled={tool.status === "loading"}
      className="text-xs font-semibold text-brand-accent hover:underline disabled:opacity-50"
    >
      {tool.status === "loading" ? t("generating") : t("generate")} →
    </button>
  );
}
