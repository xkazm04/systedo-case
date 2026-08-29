"use client";

/** W3-B — publish an experiment as a HOSTED page: draft the arm copy, preview it,
 *  and put it live at `/m/{slug}`, where the split is done by the server and the
 *  numbers come back on their own.
 *
 *  This is the panel that makes the module's old footer promise ("Seam: reálné
 *  rozdělení návštěvnosti") true. Everything it shows about a live experiment — the
 *  slug, the per-arm counts — is the SYNCED state the cron folded back into the
 *  experiment, so the panel never has a second, prettier version of the numbers the
 *  table below it is reading. Lives beside LpExperimentsManager rather than inside it:
 *  that component is already at its size ceiling, and this is a different job.
 *
 *  It deliberately offers no way to edit a live arm's copy in place. Changing the page
 *  mid-test invalidates every trial collected before the edit while the counters keep
 *  accumulating under the same arm id — the result would read as one clean experiment
 *  and be two. Unpublish, edit, re-publish. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Beaker } from "@/components/icons";
import type { LpVariantDraftResult } from "@/lib/ai-types";
import { useAiTool } from "@/components/ai/useAiTool";
import { AiPanelHeader, AiRunButton, AiToolPanel } from "@/components/ai/AiToolPanel";
import { useT } from "@/lib/i18n/client";
import HostedLpCard, { type HostedLpArm } from "./HostedLpCard";
import HostedLpDraft from "./HostedLpDraft";

const T = {
  cs: {
    title: "Publikovat jako hostovanou stránku",
    hint: "Model napíše text pro každou variantu. Po publikaci běží rozdělení návštěvnosti na naší adrese /m/… — zobrazení a konverze se samy propíší do tabulky níže. Žádné cookies, žádná data o návštěvnících.",
    selectExperiment: "Vyberte experiment",
    draft: "Navrhnout texty",
    drafting: "Píšu…",
    idleHint: "Vyberte experiment a nechte model napsat text všech variant. Publikovat můžete až po náhledu. Funguje i bez API klíče v ukázkovém režimu.",
    failed: "Akce se nezdařila.",
  },
  en: {
    title: "Publish as a hosted page",
    hint: "The model writes copy for every variant. Once published, the traffic split runs on our own /m/… address and views and conversions flow into the table below on their own. No cookies, no visitor data.",
    selectExperiment: "Select experiment",
    draft: "Draft the copy",
    drafting: "Writing…",
    idleHint: "Pick an experiment and let the model write every variant. You publish only after previewing. Works without an API key in demo mode.",
    failed: "That didn't work.",
  },
} as const;

/** The projection the server component hands down — the experiment, its arms' SYNCED
 *  numbers, and whether it is already hosted. */
export interface HostedLpItem {
  id: string;
  cluster: string;
  arms: HostedLpArm[];
  hosted?: { slug: string };
}

export default function HostedLpPanel({
  projectId,
  items,
}: {
  projectId: string;
  items: HostedLpItem[];
}) {
  const t = useT(T);
  const router = useRouter();
  const tool = useAiTool<LpVariantDraftResult>("lp-variant-draft");
  const { status, run, data } = tool;
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  async function send(init: RequestInit, url: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  const publish = (arms: LpVariantDraftResult["arms"]) =>
    send(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          kind: "lp",
          lp: { experimentId: selected?.id, arms, ...(target.trim() ? { target: target.trim() } : {}) },
        }),
      },
      "/api/microsite"
    );

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items
        .filter((i) => i.hosted)
        .map((i) => (
          <HostedLpCard
            key={i.id}
            cluster={i.cluster}
            slug={i.hosted!.slug}
            arms={i.arms}
            busy={busy}
            onUnpublish={() =>
              send(
                { method: "DELETE" },
                `/api/microsite?projectId=${projectId}&slug=${encodeURIComponent(i.hosted!.slug)}`
              )
            }
          />
        ))}

      <AiToolPanel<LpVariantDraftResult>
        tool={tool}
        idleHint={t("idleHint")}
        header={
          <AiPanelHeader icon={Beaker} title={t("title")} description={t("hint")}>
            <div className="flex items-center gap-2">
              {items.length > 1 && (
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  disabled={status === "loading"}
                  aria-label={t("selectExperiment")}
                  className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.cluster}
                    </option>
                  ))}
                </select>
              )}
              <AiRunButton
                onClick={() => {
                  if (status !== "loading" && selected) run({ projectId, experimentId: selected.id });
                }}
                loading={status === "loading"}
                disabled={status === "loading" || !selected}
                idleLabel={t("draft")}
                loadingLabel={t("drafting")}
              />
            </div>
          </AiPanelHeader>
        }
        renderResult={(r) => (
          <HostedLpDraft
            arms={r.arms}
            target={target}
            onTargetChange={setTarget}
            busy={busy}
            disabled={busy || !selected || !data}
            error={error}
            onPublish={() => publish(r.arms)}
          />
        )}
      />
    </div>
  );
}
