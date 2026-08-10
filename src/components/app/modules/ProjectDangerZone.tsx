"use client";

/** The delete half of Nastavení — extracted from ProjectSettings so both stay under
 *  the component budget, and because deleting a project is no longer a one-liner.
 *
 *  WHAT CHANGED: DELETE /api/projects/[id] returns `{ok, cleaned, failed}` — the
 *  cascade is best-effort and non-atomic, so a delete can succeed while three
 *  satellite stores keep the project's data. The old client read only `res.ok`, which
 *  made that outcome indistinguishable from a clean one; the user navigated away
 *  believing their client's data was gone. Now a partial cascade is REPORTED (which
 *  stores, and what happens next), and the resumable sweep behind
 *  /api/projects/orphans — which until now had no UI consumer anywhere — is reachable
 *  right here, both after a partial delete and on demand. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/projects/context";
import OrphanSweepPanel from "@/components/app/modules/OrphanSweepPanel";
import {
  readCascadeOutcome,
  type CascadeOutcome,
} from "@/lib/projects/settings-actions";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    dangerTitle: "Smazat projekt",
    dangerHint: "Odebere projekt z vašeho pracovního prostoru. Tuto akci nelze vrátit zpět.",
    errorDeleteFailed: "Smazání projektu se nezdařilo.",
    errorGeneric: "Něco se pokazilo.",
    confirmDelete: "Opravdu smazat „{name}“",
    cancelBtn: "Zrušit",
    deleteBtn: "Smazat projekt",
    deleting: "Mažu…",
    partialTitle: "Projekt smazán, úklid dat ale není hotový",
    partialLead: "Projekt zmizel z pracovního prostoru, ale {count} úložišť se nepodařilo vyčistit. Jejich data zůstávají uložená a nikam se už nezobrazí.",
    partialStores: "Nedokončená úložiště",
    partialNext: "Úklid je obnovitelný: dokončí se sám při dalším mazání projektu, nebo ho spusťte hned tlačítkem níže.",
    continueBtn: "Pokračovat do přehledu",
  },
  en: {
    dangerTitle: "Delete project",
    dangerHint: "Removes the project from your workspace. This action cannot be undone.",
    errorDeleteFailed: "Deleting the project failed.",
    errorGeneric: "Something went wrong.",
    confirmDelete: "Really delete “{name}”",
    cancelBtn: "Cancel",
    deleteBtn: "Delete project",
    deleting: "Deleting…",
    partialTitle: "Project deleted, but the data cleanup is unfinished",
    partialLead: "The project is gone from your workspace, but {count} stores could not be cleaned. Their data stays behind and is no longer reachable anywhere.",
    partialStores: "Unfinished stores",
    partialNext: "The cleanup is resumable: it finishes itself the next time you delete a project, or run it now with the button below.",
    continueBtn: "Continue to the workspace",
  },
} as const;

export default function ProjectDangerZone() {
  const t = useT(T);
  const router = useRouter();
  const project = useProject();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CascadeOutcome | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        // A resolved fetch is not a success: a 403/404/500 must NOT navigate away as
        // if the project were gone (it would reappear in the list, unexplained).
        setError(json.error ?? t("errorDeleteFailed"));
        setBusy(false);
        return;
      }
      const result = readCascadeOutcome(json);
      if (result.partial) {
        // Stay put: this is the ONLY moment the user can learn the cleanup is
        // unfinished, and the sweep that finishes it lives on this very panel.
        setOutcome(result);
        setBusy(false);
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError(t("errorGeneric"));
      setBusy(false);
    }
  }

  if (outcome) {
    return (
      <section className="mt-8 card max-w-2xl border-coral-500/40 p-6">
        <h3 className="text-sm font-semibold text-navy-800">{t("partialTitle")}</h3>
        <p className="mt-1 text-sm text-muted">
          {t("partialLead", { count: String(outcome.failed.length) })}
        </p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
          {t("partialStores")}
        </p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {outcome.failed.map((name) => (
            <li
              key={name}
              className="rounded-pill bg-negative-soft px-2.5 py-0.5 text-xs font-medium text-negative"
            >
              {name}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">{t("partialNext")}</p>
        <OrphanSweepPanel autoOpen />
        <button
          type="button"
          onClick={() => {
            router.push("/app");
            router.refresh();
          }}
          className="mt-4 rounded-pill bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
        >
          {t("continueBtn")}
        </button>
      </section>
    );
  }

  return (
    <section className="mt-8 card max-w-2xl border-negative/30 p-6">
      <h3 className="text-sm font-semibold text-navy-800">{t("dangerTitle")}</h3>
      <p className="mt-1 text-sm text-muted">{t("dangerHint")}</p>
      {error && (
        <p className="mt-3 rounded-lg bg-negative-soft px-3.5 py-2.5 text-sm text-negative" role="alert">
          {error}
        </p>
      )}
      {confirm ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-pill bg-negative px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? t("deleting") : t("confirmDelete", { name: project.name })}
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="text-sm font-medium text-muted hover:text-navy-700"
          >
            {t("cancelBtn")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="mt-4 rounded-pill border border-negative/40 px-4 py-2 text-sm font-semibold text-negative transition-colors hover:bg-negative-soft"
        >
          {t("deleteBtn")}
        </button>
      )}
      <OrphanSweepPanel />
    </section>
  );
}
