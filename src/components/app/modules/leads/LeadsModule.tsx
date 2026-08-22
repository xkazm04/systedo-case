"use client";

/** Leady — the module shell over ONE contact set, with a typed view registry
 *  (`views.ts`) driving the tab strip, the URL and the renderer.
 *
 *    • Přehled (landing) — one scrolling surface, top to bottom:
 *        1. the SEGMENT MAP (`segments/SegmentsView`) — source × stage heat matrix,
 *           sources by volume, and the selection card for whatever is picked;
 *        2. the TABLE + the detail pane, which own individual people.
 *      Picking a cell or a source tile filters the table IN PLACE and scrolls to
 *      it — no view switch, no second screen to lose the thread on. The map's
 *      selection is DERIVED from `api.query`, so the matrix, the toolbar selects
 *      and the rows cannot disagree, and the toolbar's "Zrušit filtr" clears both
 *      at once. (The competing "Krajina" canvas prototype was evaluated and removed
 *      on 2026-08-22.)
 *    • Fronta — the urgent, capped subset whose clock is running. A separate tab on
 *      purpose: a fully ranked queue over a large database is a list nobody
 *      finishes, and it answers "what now", not "what is going on".
 *
 *  The active view lives in the URL (`?view=`) so a link, a refresh and the back
 *  button all land where the operator expects. */
import { Suspense, useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import { Button } from "@/components/ui";
import { Plus } from "@/components/icons";
import Segmented from "@/components/dashboard/vykon/Segmented";
import { useT } from "@/lib/i18n/client";
import type { Contact } from "@/lib/leads/types";
import { useLeads } from "./useLeads";
import { useLeadSummary } from "./useLeadSummary";
import { enabledViews, parseView, VIEW_T, type LeadView } from "./views";
import LeadQueue from "./LeadQueue";
import LeadTable from "./LeadTable";
import LeadDetail from "./LeadDetail";
import LeadCreateModal from "./LeadCreateModal";
import type { SegmentFilter } from "./segments/SegmentsView";

const SegmentsView = dynamic(() => import("./segments/SegmentsView"), {
  loading: () => <SectionSkeleton />,
});

const T = {
  cs: {
    view: "Zobrazení",
    create: "Nový kontakt",
    introPrehled:
      "Mapa segmentů nad celou databází: zdroj × fáze jako teplotní matice. Kliknutí na buňku přefiltruje tabulku pod ní.",
    introFronta: "Co udělat teď: nejnaléhavější poptávky, kterým právě běží čas. Zkrácený seznam, ne celá databáze.",
  },
  en: {
    view: "View",
    create: "New contact",
    introPrehled:
      "A segment map over the whole database: source × stage as a heat matrix. Click a cell and the table beneath it filters.",
    introFronta: "What to do now: the most urgent enquiries whose clock is running. A short list, not the whole database.",
  },
} as const;

const INTRO_KEY = {
  prehled: "introPrehled",
  fronta: "introFronta",
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

  /** Bumped after every write so the list, the segment map and the queue refetch
   *  together — three surfaces disagreeing about the same contact is the failure
   *  mode a shared reload key exists to prevent. */
  const [reloadKey, setReloadKey] = useState(0);
  const { summary, loading: summaryLoading } = useLeadSummary(projectId, reloadKey);

  const view = parseView(search.get("view"));
  const setView = useCallback(
    (next: LeadView) => {
      const params = new URLSearchParams(search.toString());
      if (next === "prehled") params.delete("view");
      else params.set("view", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, search]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement | null>(null);

  /** The map's one gesture: filter the table below, then take the operator there.
   *  Nothing is remembered here — the query IS the selection. */
  const pickSegment = (next: SegmentFilter) => {
    api.setQuery({ stage: next.stage, source: next.source, offset: 0 });
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    setView("prehled");
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

      {view === "fronta" ? (
        <LeadQueue
          projectId={projectId}
          live={api.live}
          reloadKey={reloadKey}
          onOpen={openFromQueue}
          onAdvance={advance}
        />
      ) : (
        <>
          <SegmentsView
            summary={summary}
            loading={summaryLoading}
            filter={{ source: api.query.source, stage: api.query.stage }}
            onPick={pickSegment}
          />
          <div ref={tableRef} className="grid gap-5 scroll-mt-4 lg:grid-cols-[minmax(0,1fr)_360px]">
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
