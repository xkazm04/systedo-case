"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Bookmark, Close, Document, Info } from "@/components/icons";
import { Pill } from "@/components/ui";
import Modal from "@/components/app/Modal";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import { useProject } from "@/lib/projects/context";
import { useFormatters, useT } from "@/lib/i18n/client";
import { interactiveRowProps } from "@/lib/a11y/rowActivation";
import { isDegraded } from "@/lib/llm/output-health";
import { clearLibraryLinks } from "@/lib/content-schedule/compute";
import type { ContentPost } from "@/lib/content-schedule/sample";
import type { SavedContentEntry } from "@/lib/content-library/entries";
import { deleteContentEntryAction, listContentEntriesAction } from "./content-library-actions";

/** The workspace is heavy and modal-gated — load its JS on first open, not on the
 *  library's initial paint (Modal renders null while closed). */
const ContentBriefGenerator = dynamic(() => import("./ContentBriefGenerator"), {
  loading: () => <SectionSkeleton height="h-96" />,
});

const T = {
  cs: {
    loading: "Načítám uložený obsah…",
    emptyTitle: "Zatím tu nic není",
    emptyBody:
      "Co vygenerujete v Obsahovém enginu (brief i koncept článku) sem uložíte tlačítkem „Uložit do knihovny“. Uložený obsah zůstává u projektu, takže ho najdete i na jiném počítači.",
    countPill: "{n} uloženo",
    colTitle: "Název",
    colKind: "Obsah",
    colOrigin: "Původ",
    colSaved: "Uloženo",
    kindBrief: "Brief",
    kindArticle: "Brief + článek",
    originDemo: "Ukázka",
    originDemoTitle: "Vzniklo v ukázkovém režimu — text je předpřipravený, nešel přes model.",
    originDegraded: "Neúplné",
    originDegradedTitle: "Model vrátil odpověď, která přišla useknutá nebo jí chyběly části. Uložili jsme ji tak, jak dorazila.",
    originUnknown: "Stav neznámý",
    originUnknownTitle: "Uloženo dřív, než knihovna začala ukládat výsledek kontroly generování. Netvrdíme, že je záznam v pořádku — nevíme to.",
    open: "Otevřít",
    deleteLabel: "Smazat „{title}“",
    deleteConfirm: "Smazat?",
    deleteYes: "Smazat",
    deleteNo: "Zpět",
    modalDesc: "Uložený brief se načetl do pracovní plochy. Můžete ho upravit a vygenerovat znovu.",
    missingEntry: "Tenhle uložený obsah už v knihovně není — nejspíš byl smazaný. Odkaz, který vás sem přivedl, míří na záznam, který neexistuje.",
  },
  en: {
    loading: "Loading saved content…",
    emptyTitle: "Nothing saved yet",
    emptyBody:
      "Whatever you generate in the Content engine (the brief and the article draft) lands here via “Save to library”. Saved content belongs to the project, so it's there on another machine too.",
    countPill: "{n} saved",
    colTitle: "Title",
    colKind: "Content",
    colOrigin: "Origin",
    colSaved: "Saved",
    kindBrief: "Brief",
    kindArticle: "Brief + article",
    originDemo: "Sample",
    originDemoTitle: "Produced in demo mode — canned copy that never went through a model.",
    originDegraded: "Incomplete",
    originDegradedTitle: "The model's answer came back truncated or missing parts. We saved it exactly as it arrived.",
    originUnknown: "Health unknown",
    originUnknownTitle: "Saved before the library kept the generation's health verdict. We don't claim this entry is clean — we don't know.",
    open: "Open",
    deleteLabel: "Delete “{title}”",
    deleteConfirm: "Delete?",
    deleteYes: "Delete",
    deleteNo: "Cancel",
    modalDesc: "The saved brief is loaded into the workspace. Edit it and regenerate if you want.",
    missingEntry: "That saved entry is no longer in the library — it was most likely deleted. The link that brought you here points at something that doesn't exist.",
  },
} as const;

/** The provenance chips one row earns. Model/demo/health at LIST level, because a
 *  canned demo entry and a truncated one used to be indistinguishable from real,
 *  complete output until you opened them. Ordered most-important-first. */
function OriginChips({
  entry: e,
  t,
}: {
  entry: SavedContentEntry;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
}) {
  // The article half can be degraded while the brief is fine (and vice versa) —
  // the row speaks for the whole entry, so either one flags it.
  const degraded = isDegraded(e.briefMeta?.status) || isDegraded(e.draftMeta?.status);
  const unknown = e.briefMeta?.status === undefined;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {e.briefMeta?.demo ? (
        <Pill tone="coral">
          <span title={t("originDemoTitle")}>{t("originDemo")}</span>
        </Pill>
      ) : (
        e.briefMeta?.model && <Pill tone="neutral">{e.briefMeta.model}</Pill>
      )}
      {degraded && (
        <Pill tone="negative">
          <span title={t("originDegradedTitle")}>{t("originDegraded")}</span>
        </Pill>
      )}
      {!degraded && unknown && (
        <Pill tone="neutral">
          <span title={t("originUnknownTitle")}>{t("originUnknown")}</span>
        </Pill>
      )}
    </span>
  );
}

/** "Uložený obsah" — everything the Obsahový engine produced and the user chose to
 *  keep, stored per project (not in this browser). A row opens the SAME workspace
 *  that produced it, with the brief and any article draft restored, so the library
 *  is a way back into the work rather than a read-only archive. */
export default function SavedContentLibrary({ entryId }: { entryId?: string } = {}) {
  const project = useProject();
  const t = useT(T);
  const fmt = useFormatters();

  const [entries, setEntries] = useState<SavedContentEntry[] | null>(null);
  const [open, setOpen] = useState<SavedContentEntry | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A `?entry=` deep link (the plan slot's "Uložený koncept") that resolved to
  // nothing: the pointer outlived the entry, and the page says so instead of
  // dumping the visitor on the module root with no explanation.
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    void listContentEntriesAction(project.id)
      .then((list) => {
        if (!alive) return;
        setEntries(list);
        // Honor the deep link once the list is in: open the named entry, or
        // disclose that it is gone.
        if (entryId) {
          const found = list.find((e) => e.id === entryId) ?? null;
          setOpen(found);
          setMissing(found === null);
        }
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    return () => {
      alive = false;
    };
  }, [project.id, entryId]);

  const list = useMemo(() => entries ?? [], [entries]);

  /** Deleting an entry leaves any content-schedule slot that produced it pointing
   *  at nothing — the slot keeps claiming "Koncept hotový" and offers a link to a
   *  dead id. Swept HERE, at the delete, rather than detected at the board's
   *  render: the board would have to load the whole library on every paint just to
   *  ask "does my pointer still resolve", and it would still show the stale claim
   *  until someone opened the plan. Best-effort — the delete itself already
   *  succeeded, and the deep link discloses a dangling pointer as a fallback. */
  const sweepPlanLinks = async (id: string) => {
    const url = `/api/projects/${project.id}/state/content-schedule`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const { data } = (await res.json()) as { data?: ContentPost[] | null };
      if (!Array.isArray(data)) return;
      const next = clearLibraryLinks(data, id);
      if (!next) return;
      await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: next }),
      });
    } catch {
      /* the delete stands; a stale pointer is disclosed when it is followed */
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      setEntries(await deleteContentEntryAction(project.id, id));
      await sweepPlanLinks(id);
    } catch {
      /* leave the list as-is — the entry is still there and reappears on reload */
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  if (entries === null) return <SectionSkeleton height="h-64" />;

  return (
    <div className="stagger space-y-6">
      {missing && (
        <div className="flex flex-wrap items-start gap-2 rounded-card border border-line bg-canvas/60 px-4 py-3 text-sm text-muted">
          <Info width={15} height={15} className="mt-0.5 shrink-0 text-navy-600" />
          <p className="min-w-0">{t("missingEntry")}</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Bookmark width={16} height={16} className="text-brand-accent" />
            <h3 className="text-base font-semibold text-navy-800">{t("colTitle")}</h3>
          </div>
          {list.length > 0 && <Pill tone="neutral">{t("countPill", { n: list.length })}</Pill>}
        </div>

        {list.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-accent">
              <Document width={22} height={22} />
            </span>
            <p className="mt-3 text-base font-semibold text-navy-800">{t("emptyTitle")}</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">{t("emptyBody")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">{t("colTitle")}</th>
                  <th className="px-4 py-3 font-medium">{t("colKind")}</th>
                  <th className="px-4 py-3 font-medium">{t("colOrigin")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("colSaved")}</th>
                  <th className="w-24 px-4 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr
                    key={e.id}
                    {...interactiveRowProps(() => setOpen(e), e.title)}
                    className={
                      "group cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 " +
                      (entryId === e.id ? "bg-brand-50/60" : "")
                    }
                  >
                    <td className="px-5 py-3 font-medium text-navy-800">{e.title}</td>
                    <td className="px-4 py-3">
                      <Pill tone={e.kind === "article" ? "positive" : "neutral"}>
                        {e.kind === "article" ? t("kindArticle") : t("kindBrief")}
                      </Pill>
                    </td>
                    <td className="px-4 py-3">
                      <OriginChips entry={e} t={t} />
                    </td>
                    <td className="tnum px-4 py-3 text-right text-muted" title={fmt.fmtDateTime(e.savedAt)}>
                      {fmt.fmtRelative(e.savedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {confirming === e.id ? (
                          <span
                            className="flex items-center gap-1.5"
                            onClick={(ev) => ev.stopPropagation()}
                            onKeyDown={(ev) => ev.stopPropagation()}
                            role="presentation"
                          >
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void remove(e.id)}
                              className="rounded-pill bg-negative-soft px-2.5 py-1 text-xs font-semibold text-negative disabled:opacity-50"
                            >
                              {t("deleteYes")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirming(null)}
                              className="rounded-pill border border-line px-2.5 py-1 text-xs font-medium text-muted"
                            >
                              {t("deleteNo")}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label={t("deleteLabel", { title: e.title })}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setConfirming(e.id);
                            }}
                            className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-negative-soft hover:text-negative"
                          >
                            <Close width={14} height={14} />
                          </button>
                        )}
                        <ArrowRight
                          width={16}
                          height={16}
                          className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-accent"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* The workspace, restored (layer 2) — the same component that produced it. */}
      <Modal open={open !== null} onClose={() => setOpen(null)} size="full" title={open?.title} description={t("modalDesc")}>
        {open && <ContentBriefGenerator key={open.id} restored={open} />}
      </Modal>
    </div>
  );
}
