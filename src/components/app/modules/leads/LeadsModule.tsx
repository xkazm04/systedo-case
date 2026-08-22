"use client";

/** Leady — the module shell over ONE contact set, with a typed view registry
 *  (`views.ts`) driving the tab strip, the URL and the renderer.
 *
 *    • Databáze (landing) — the table + detail pane. This is the primary surface
 *      because it is the one that survives a thousand contacts: search, stage
 *      filter, counts and paging are all pushed to the API, and the aggregate
 *      strip above it comes from one bounded server-side scan.
 *    • Fronta — the urgent, capped subset whose clock is running. Secondary on
 *      purpose: a fully ranked queue over a large database is a list nobody
 *      finishes.
 *    • Segmenty — the AGGREGATE overview over `/crm/summary`: source × stage as a
 *      heat matrix, sources by volume. Every cell is a filter that drills down into
 *      Databáze. (The competing "Krajina" canvas prototype was evaluated and
 *      removed on 2026-08-22.)
 *
 *  The active view lives in the URL (`?view=`) so a link, a refresh and the back
 *  button all land where the operator expects. */
import { Suspense, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import { Button } from "@/components/ui";
import { Plus } from "@/components/icons";
import Segmented from "@/components/dashboard/vykon/Segmented";
import { useT } from "@/lib/i18n/client";
import type { Contact, PipelineStage } from "@/lib/leads/types";
import { useLeads } from "./useLeads";
import { useLeadSummary } from "./useLeadSummary";
import { enabledViews, parseView, VIEW_T, type LeadView } from "./views";
import LeadQueue from "./LeadQueue";
import LeadTable from "./LeadTable";
import LeadDetail from "./LeadDetail";
import LeadSummaryBar from "./LeadSummaryBar";
import LeadCreateModal from "./LeadCreateModal";
import type { ContactQuery } from "@/lib/leads/store-filter";

const SegmentsView = dynamic(() => import("./segments/SegmentsView"), {
  loading: () => <SectionSkeleton />,
});
const T = {
  cs: {
    view: "Zobrazení",
    create: "Nový kontakt",
    introVse: "Kompletní databáze kontaktů — filtrování, hromadné akce, časová osa a souhlasy na jednom místě.",
    introFronta: "Co udělat teď: nejnaléhavější poptávky, kterým právě běží čas. Zkrácený seznam, ne celá databáze.",
    introSegmenty: "Mapa segmentů: zdroj × fáze jako teplotní matice, zdroje podle objemu. Každá buňka je filtr do databáze.",
  },
  en: {
    view: "View",
    create: "New contact",
    introVse: "The complete contact database — filters, bulk actions, timeline and consents in one place.",
    introFronta: "What to do now: the most urgent enquiries whose clock is running. A short list, not the whole database.",
    introSegmenty: "Segment map: source × stage as a heat matrix, sources by volume. Every cell is a filter into the database.",
  },
} as const;

const INTRO_KEY = {
  vse: "introVse",
  fronta: "introFronta",
  segmenty: "introSegmenty",
} as const satisfies Record<LeadView, keyof typeof T.cs>;

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
  const viewLabel = useT(VIEW_T);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const api = useLeads(projectId, initial);

  /** Bumped after every write so the list, the aggregate strip and the queue
   *  refetch together — three surfaces disagreeing about the same contact is the
   *  failure mode a shared reload key exists to prevent. */
  const [reloadKey, setReloadKey] = useState(0);
  const { summary, live: summaryLive, total: summaryTotal, loading: summaryLoading } =
    useLeadSummary(projectId, reloadKey);

  const view = parseView(search.get("view"));
  const setView = useCallback(
    (next: LeadView) => {
      const params = new URLSearchParams(search.toString());
      if (next === "vse") params.delete("view");
      else params.set("view", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, search]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  /** An aggregate view's drill-down: apply its filter and land in the database. */
  const openInTable = (query: Partial<ContactQuery>) => {
    // ContactQuery is the wire shape; LeadQuery is the client's — map explicitly so
    // an aggregate view's filter is never silently dropped by a key mismatch.
    api.setQuery({
      stage: query.stage ?? "",
      source: query.source ?? "",
      q: query.search ?? "",
      offset: 0,
    });
    setView("vse");
  };
  const selected = api.contacts.find((c) => c.id === selectedId) ?? null;

  const afterWrite = async () => {
    setReloadKey((k) => k + 1);
    await api.refresh();
  };

  /** Opening a row from the queue takes the operator to the record in the view
   *  that owns it — one detail surface, never a second half-detail. */
  const openFromQueue = (c: Contact) => {
    setSelectedId(c.id);
    setView("vse");
  };

  const changeStage = async (stage: string, reason?: string) => {
    if (!selected || !api.live) return;
    await api.patch(selected.id, { stage, ...(reason ? { reason } : {}) });
    setReloadKey((k) => k + 1);
  };

  /** The queue's inline "move on": one step forward and the clock stops. */
  const advance = async (c: Contact) => {
    if (!api.live) return;
    const next = c.stage === "new" ? "working" : c.stage === "working" ? "qualified" : "opportunity";
    await api.patch(c.id, { stage: next, firstRespondedAt: true });
    await afterWrite();
  };

  return (
    <div className="stagger space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<LeadView>
          ariaLabel={t("view")}
          value={view}
          onChange={setView}
          options={enabledViews().map((v) => ({ value: v.key, label: viewLabel(v.key) }))}
        />
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus width={15} height={15} />
          {t("create")}
        </Button>
      </div>

      <p className="max-w-2xl text-sm leading-relaxed text-muted">{t(INTRO_KEY[view])}</p>

      {view === "segmenty" ? (
        <SegmentsView
          projectId={projectId}
          summary={summary}
          live={summaryLive}
          total={summaryTotal}
          loading={summaryLoading}
          onOpenInTable={openInTable}
        />
      ) : view === "fronta" ? (
        <LeadQueue
          projectId={projectId}
          live={api.live}
          reloadKey={reloadKey}
          onOpen={openFromQueue}
          onAdvance={advance}
        />
      ) : (
        <>
          <LeadSummaryBar
            summary={summary}
            activeStage={api.query.stage}
            onStage={(s: PipelineStage | "") => api.setQuery({ stage: s })}
          />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <LeadTable api={api} selectedId={selectedId} onOpen={(c) => setSelectedId(c.id)} />
            <LeadDetail
              projectId={projectId}
              contact={selected}
              live={api.live}
              onStageChange={changeStage}
            />
          </div>
        </>
      )}

      <LeadCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        live={api.live}
        onCreate={async (input) => {
          const created = await api.create(input);
          if (created) await afterWrite();
          return created !== null;
        }}
      />
    </div>
  );
}
