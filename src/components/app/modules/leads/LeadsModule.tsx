"use client";

/** Leady — the module shell. Two views over ONE contact set:
 *    • Fronta (Variant B) — the prioritised SLA work queue, and the landing view,
 *      because "what do I do next" is the question a lead module exists to answer.
 *    • Vše (Variant C) — the full database with filters, bulk actions and a detail
 *      pane, for the times the question is "where is that person from March".
 *
 *  The active view lives in the URL (`?tab=`) so a link, a refresh and the browser
 *  back button all land where the operator expects. */
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { Plus } from "@/components/icons";
import Segmented from "@/components/dashboard/vykon/Segmented";
import { useT } from "@/lib/i18n/client";
import type { Contact } from "@/lib/leads/types";
import { useLeads } from "./useLeads";
import LeadQueue from "./LeadQueue";
import LeadTable from "./LeadTable";
import LeadDetail from "./LeadDetail";
import LeadCreateModal from "./LeadCreateModal";

const T = {
  cs: {
    queue: "Fronta", all: "Vše", view: "Zobrazení",
    create: "Nový kontakt",
    intro: "Co udělat teď, seřazeno podle rizika ztráty. Nejdřív ti, kterým právě běží čas.",
    introAll: "Kompletní databáze kontaktů — filtrování, hromadné akce, časová osa a souhlasy na jednom místě.",
  },
  en: {
    queue: "Queue", all: "All", view: "View",
    create: "New contact",
    intro: "What to do now, ranked by what is being lost. The ones whose clock is running come first.",
    introAll: "The complete contact database — filters, bulk actions, timeline and consents in one place.",
  },
} as const;

type Tab = "fronta" | "vse";

export default function LeadsModule(props: {
  projectId: string;
  initial: { contacts: Contact[]; live: boolean; total: number };
}) {
  return (
    <Suspense fallback={null}>
      <LeadsModuleInner {...props} />
    </Suspense>
  );
}

function LeadsModuleInner({
  projectId,
  initial,
}: {
  projectId: string;
  initial: { contacts: Contact[]; live: boolean; total: number };
}) {
  const t = useT(T);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const api = useLeads(projectId, initial);

  const tab: Tab = search.get("tab") === "vse" ? "vse" : "fronta";
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(search.toString());
    if (next === "fronta") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const selected = api.contacts.find((c) => c.id === selectedId) ?? null;

  /** Opening a row from the queue takes the operator to the record, not to a
   *  second half-detail: one detail surface, in the view that owns it. */
  const open = (c: Contact) => {
    setSelectedId(c.id);
    if (tab !== "vse") setTab("vse");
  };

  const changeStage = async (stage: string, reason?: string) => {
    if (!selected || !api.live) return;
    await api.patch(selected.id, { stage, ...(reason ? { reason } : {}) });
  };

  /** The queue's inline "move on" — one step forward, no dialog. */
  const advance = async (c: Contact) => {
    if (!api.live) return;
    const next = c.stage === "new" ? "working" : c.stage === "working" ? "qualified" : "opportunity";
    await api.patch(c.id, { stage: next, firstRespondedAt: true });
  };

  return (
    <div className="stagger space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          ariaLabel={t("view")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "fronta", label: t("queue") },
            { value: "vse", label: t("all") },
          ]}
        />
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus width={15} height={15} />
          {t("create")}
        </Button>
      </div>

      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        {tab === "fronta" ? t("intro") : t("introAll")}
      </p>

      {tab === "fronta" ? (
        <LeadQueue
          projectId={projectId}
          contacts={api.contacts}
          live={api.live}
          onOpen={open}
          onAdvance={advance}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <LeadTable api={api} selectedId={selectedId} onOpen={(c) => setSelectedId(c.id)} />
          <LeadDetail
            projectId={projectId}
            contact={selected}
            live={api.live}
            onStageChange={changeStage}
          />
        </div>
      )}

      <LeadCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        live={api.live}
        onCreate={async (input) => {
          const created = await api.create(input);
          if (created) await api.refresh();
          return created !== null;
        }}
      />
    </div>
  );
}
