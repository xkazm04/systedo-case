"use client";

/** D1 — a coverage-matrix cell that doubles as a manual page-presence toggle. Renders
 *  the seeded/imported rank pill; when a live project is present, clicking it flips
 *  whether the service×locality has a dedicated page and persists that through the SAME
 *  local-signals coverage seam (a single-row union-merge), then refreshes. Without a
 *  projectId it is a plain static pill (the marketing demo). Client. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import type { PillTone } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: { toggleHint: "Klikněte pro přepnutí pokrytí (stránka ano/ne)", saving: "…" },
  en: { toggleHint: "Click to toggle coverage (page yes/no)", saving: "…" },
} as const;

export default function CoverageCell({
  projectId,
  service,
  area,
  hasPage,
  tone,
  label,
}: {
  projectId?: string;
  service: string;
  area: string;
  hasPage: boolean;
  tone: PillTone;
  label: string;
}) {
  const t = useT(T);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!projectId) return <Pill tone={tone}>{label}</Pill>;

  async function toggle() {
    setBusy(true);
    try {
      await fetch(`/api/projects/${projectId}/local-signals/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "coverage", rows: [{ service, locality: area, hasPage: !hasPage }] }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={t("toggleHint")}
      className="rounded-pill transition-opacity hover:opacity-80 disabled:opacity-50"
    >
      <Pill tone={tone}>{busy ? t("saving") : label}</Pill>
    </button>
  );
}
