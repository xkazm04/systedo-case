"use client";
/** The "Needs attention" row list — and, on a single project's own overview, its
 *  triage inbox: dismiss a row (optimistic, "Hidden · Undo" in its place) and restore
 *  it from the "Hidden (n)" list.
 *
 *  The row CONTENT is rendered by the server shell (NeedsAttention) and arrives here as
 *  a node, so this island owns only the verdicts. Without `triageProjectId` (portfolio,
 *  public demo, anonymous viewer) it renders the plain read-only list — no ledger backs
 *  a verdict there. Every verdict goes through the existing
 *  PATCH /api/projects/{id}/advice; the state machine is the pure @/lib/advice/triage,
 *  so a failed write returns the row with a named notice and a refresh mid-flight
 *  cannot resurrect it. The dismiss button is a SIBLING of the row's <Link>, never an
 *  interactive element inside an anchor. */
import { Fragment, useEffect, useReducer, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Close } from "@/components/icons";
import DismissedAdvice from "@/components/app/overview/DismissedAdvice";
import {
  actionStatus,
  adviceStatusRequest,
  canUndo,
  isHidden,
  triageReducer,
  type TriageState,
} from "@/lib/advice/triage";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    dismiss: "Skrýt doporučení „{title}“",
    hiding: "Skrývám…",
    hidden: "Skryto",
    undo: "Vrátit",
    failed: "Doporučení se nepodařilo změnit. Zkuste to prosím znovu.",
    untracked: "Doporučení se teprve začíná sledovat. Zkuste to za chvíli znovu.",
  },
  en: {
    dismiss: "Hide recommendation “{title}”",
    hiding: "Hiding…",
    hidden: "Hidden",
    undo: "Undo",
    failed: "Couldn't update this recommendation. Please try again.",
    untracked: "This recommendation is not tracked yet. Try again in a moment.",
  },
} as const;

/** One feed row. `node` is the server-rendered row (its <Link>). */
export interface FeedRow {
  id: string;
  subjectKey: string;
  title: string;
  /** hidden by a ledger verdict at render time */
  dismissed: boolean;
  node: ReactNode;
}

export default function AdviceFeed({
  rows,
  empty,
  triageProjectId = null,
}: {
  rows: FeedRow[];
  /** rendered when no row is in the list */
  empty: ReactNode;
  triageProjectId?: string | null;
}) {
  const t = useT(T);
  const router = useRouter();
  const [state, dispatch] = useReducer(triageReducer, {} as TriageState);

  // A fresh server render drops only the client verdicts it now agrees with.
  const serverVisible = rows
    .filter((r) => !r.dismissed)
    .map((r) => r.subjectKey)
    .join("\n");
  useEffect(() => {
    dispatch({ type: "reconcile", visibleKeys: serverVisible ? serverVisible.split("\n") : [] });
  }, [serverVisible]);

  const verdict = async (type: "dismiss" | "undo", key: string) => {
    if (!triageProjectId) return;
    dispatch({ type, key });
    const { url, init } = adviceStatusRequest(triageProjectId, key, actionStatus({ type }));
    let httpStatus = 0; // a network failure stays 0 — the reducer names it "failed"
    try {
      httpStatus = (await fetch(url, init)).status;
    } catch {}
    dispatch({ type: "settled", key, httpStatus });
    if (httpStatus >= 200 && httpStatus < 300) router.refresh();
  };

  // A row the client holds a verdict on stays in place (as a row or as "Hidden · Undo");
  // otherwise the server's verdict decides.
  const listed = rows.filter((r) => (r.subjectKey in state ? true : !r.dismissed));
  const hiddenList = rows.filter((r) => r.dismissed && !(r.subjectKey in state));
  const notice = state.error ? t(state.error.kind) : null;

  return (
    <>
      {listed.length === 0 ? (
        empty
      ) : (
        <div className="mt-3 card divide-y divide-line overflow-hidden">
          {listed.map((r) => {
            const error = state.error?.key === r.subjectKey ? notice : null;
            if (!triageProjectId) return <Fragment key={r.id}>{r.node}</Fragment>;
            if (isHidden(state, r.subjectKey)) {
              const undoable = canUndo(state, r.subjectKey);
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-xs text-muted"
                >
                  <span className="min-w-0 truncate">
                    {undoable ? t("hidden") : t("hiding")} · {r.title}
                  </span>
                  {undoable && (
                    <button
                      type="button"
                      onClick={() => verdict("undo", r.subjectKey)}
                      className="shrink-0 font-semibold text-brand-accent hover:underline"
                    >
                      {t("undo")}
                    </button>
                  )}
                  {error && (
                    <span role="alert" className="w-full text-negative">
                      {error}
                    </span>
                  )}
                </div>
              );
            }
            return (
              <div key={r.id}>
                <div className="flex items-start">
                  <div className="min-w-0 flex-1">{r.node}</div>
                  <button
                    type="button"
                    onClick={() => verdict("dismiss", r.subjectKey)}
                    aria-label={t("dismiss", { title: r.title })}
                    title={t("dismiss", { title: r.title })}
                    className="m-2 grid h-8 w-8 shrink-0 place-items-center rounded-pill text-muted transition-colors hover:bg-navy-50 hover:text-navy-800"
                  >
                    <Close width={15} height={15} />
                  </button>
                </div>
                {error && (
                  <p role="alert" className="px-4 pb-3 pl-9 text-xs text-negative">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {triageProjectId && hiddenList.length > 0 && (
        <DismissedAdvice items={hiddenList} onRestore={(key) => verdict("undo", key)} />
      )}
    </>
  );
}
