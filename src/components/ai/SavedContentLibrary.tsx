"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Bookmark, Close, Document } from "@/components/icons";
import { Pill } from "@/components/ui";
import Modal from "@/components/app/Modal";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import { useProject } from "@/lib/projects/context";
import { useFormatters, useT } from "@/lib/i18n/client";
import { interactiveRowProps } from "@/lib/a11y/rowActivation";
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
      "Co vygenerujete v Obsahovém enginu — brief i koncept článku — sem uložíte tlačítkem „Uložit do knihovny“. Uložený obsah zůstává u projektu, takže ho najdete i na jiném počítači.",
    countPill: "{n} uloženo",
    colTitle: "Název",
    colKind: "Obsah",
    colSaved: "Uloženo",
    kindBrief: "Brief",
    kindArticle: "Brief + článek",
    open: "Otevřít",
    deleteLabel: "Smazat „{title}“",
    deleteConfirm: "Smazat?",
    deleteYes: "Smazat",
    deleteNo: "Zpět",
    modalDesc: "Uložený brief se načetl do pracovní plochy — můžete ho upravit a vygenerovat znovu.",
  },
  en: {
    loading: "Loading saved content…",
    emptyTitle: "Nothing saved yet",
    emptyBody:
      "Whatever you generate in the Content engine — the brief and the article draft — lands here via “Save to library”. Saved content belongs to the project, so it's there on another machine too.",
    countPill: "{n} saved",
    colTitle: "Title",
    colKind: "Content",
    colSaved: "Saved",
    kindBrief: "Brief",
    kindArticle: "Brief + article",
    open: "Open",
    deleteLabel: "Delete “{title}”",
    deleteConfirm: "Delete?",
    deleteYes: "Delete",
    deleteNo: "Cancel",
    modalDesc: "The saved brief is loaded into the workspace — edit it and regenerate if you want.",
  },
} as const;

/** "Uložený obsah" — everything the Obsahový engine produced and the user chose to
 *  keep, stored per project (not in this browser). A row opens the SAME workspace
 *  that produced it, with the brief and any article draft restored, so the library
 *  is a way back into the work rather than a read-only archive. */
export default function SavedContentLibrary() {
  const project = useProject();
  const t = useT(T);
  const fmt = useFormatters();

  const [entries, setEntries] = useState<SavedContentEntry[] | null>(null);
  const [open, setOpen] = useState<SavedContentEntry | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void listContentEntriesAction(project.id)
      .then((list) => {
        if (alive) setEntries(list);
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    return () => {
      alive = false;
    };
  }, [project.id]);

  const list = useMemo(() => entries ?? [], [entries]);

  const remove = async (id: string) => {
    setBusy(true);
    try {
      setEntries(await deleteContentEntryAction(project.id, id));
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
                  <th className="px-4 py-3 text-right font-medium">{t("colSaved")}</th>
                  <th className="w-24 px-4 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr
                    key={e.id}
                    {...interactiveRowProps(() => setOpen(e), e.title)}
                    className="group cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                  >
                    <td className="px-5 py-3 font-medium text-navy-800">{e.title}</td>
                    <td className="px-4 py-3">
                      <Pill tone={e.kind === "article" ? "positive" : "neutral"}>
                        {e.kind === "article" ? t("kindArticle") : t("kindBrief")}
                      </Pill>
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
