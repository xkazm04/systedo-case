"use client";

/** Napojení Google Ads, on the page that has always ADVERTISED it — the module
 *  registry's blurb for `nastaveni` promises "napojení Google Ads", but the only
 *  client of the guarded PATCH route was the projects hub, so the promise pointed at
 *  a control that wasn't here.
 *
 *  Same route, same rule, same grammar as the hub: `decideAdsLink` is pre-flighted
 *  per account (so a collision is explained BEFORE the round-trip, naming the project
 *  that holds the account), the destructive branches (relink / unlink) are
 *  confirm-gated over the shared Modal, and the server stays the authority — a stale
 *  page still gets its 409/422 and shows it. Per the r15 design, a refusal is
 *  recoverable: unlink exists, and the message says where to use it. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/app/Modal";
import { useProject, useProjects } from "@/lib/projects/context";
import { projectAdsLink, type LinkableAccount } from "@/lib/projects/ads-link";
import { adsAccountOptions, adsPatchOutcome } from "@/lib/projects/settings-actions";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    title: "Napojení Google Ads",
    lead: "Projekt čerpá data z jednoho účtu Google Ads. Jeden účet může patřit vždy jen jednomu projektu.",
    linkedTo: "Napojený účet",
    notLinked: "Bez napojení",
    notLinkedHint: "Vyberte účet ze svých připojených účtů Google Ads.",
    noAccounts: "Nemáte připojený žádný účet Google Ads. Připojte ho v modulu Kampaně.",
    choose: "Vyberte účet",
    claimedOption: "{name} · už patří projektu {project}",
    currentOption: "{name} · aktuálně napojený",
    replacesOption: "{name} · nahradí {id}",
    unlink: "Odpojit účet",
    working: "Ukládám…",
    relinkTitle: "Nahradit stávající napojení?",
    relinkLead: "Projekt {project} je teď napojený na účet {current}. Napojením účtu {next} se stávající propojení zruší a data z účtu {current} se přestanou synchronizovat.",
    relinkConfirm: "Nahradit napojení",
    unlinkTitle: "Odpojit účet Google Ads?",
    unlinkLead: "Projekt {project} se přestane synchronizovat s účtem {account}. Dosud nasbíraná data zůstanou, nová nepřibudou. Účet můžete kdykoli napojit znovu, i na jiný projekt.",
    unlinkConfirm: "Odpojit",
    cancel: "Zrušit",
    errClaimed: "Tento účet už je napojený na jiný projekt. Nejdřív ho tam odpojte.",
    errUnknown: "Tento účet není mezi vašimi připojenými účty Google Ads.",
    errFailed: "Změnu napojení se nepodařilo uložit. Zkuste to prosím znovu.",
  },
  en: {
    title: "Google Ads connection",
    lead: "The project pulls data from a single Google Ads account. One account can belong to only one project at a time.",
    linkedTo: "Linked account",
    notLinked: "Not linked",
    notLinkedHint: "Pick one of your connected Google Ads accounts.",
    noAccounts: "You have no connected Google Ads account. Connect one in the Campaigns module.",
    choose: "Choose an account",
    claimedOption: "{name} · already belongs to {project}",
    currentOption: "{name} · currently linked",
    replacesOption: "{name} · replaces {id}",
    unlink: "Unlink account",
    working: "Saving…",
    relinkTitle: "Replace the existing link?",
    relinkLead: "Project {project} is currently linked to account {current}. Linking account {next} drops that link and data from account {current} stops syncing.",
    relinkConfirm: "Replace link",
    unlinkTitle: "Unlink the Google Ads account?",
    unlinkLead: "Project {project} will stop syncing with account {account}. Data collected so far stays; no new data arrives. You can link the account again any time, including to a different project.",
    unlinkConfirm: "Unlink",
    cancel: "Cancel",
    errClaimed: "This account is already linked to another project. Unlink it there first.",
    errUnknown: "This account isn't among your connected Google Ads accounts.",
    errFailed: "Couldn't save the connection change. Please try again.",
  },
} as const;

type Pending = { kind: "relink"; customerId: string } | { kind: "unlink" };

export default function ProjectAdsLink({ accounts = [] }: { accounts?: LinkableAccount[] }) {
  const t = useT(T);
  const router = useRouter();
  const project = useProject();
  const projects = useProjects();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const link = projectAdsLink(project, accounts);
  const options = adsAccountOptions({ project, accounts, projects });

  async function patch(customerId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adsCustomerId: customerId }),
      });
      const outcome = adsPatchOutcome(res.status);
      if (outcome !== "ok") {
        setError(
          outcome === "already-claimed"
            ? t("errClaimed")
            : outcome === "unknown-account"
              ? t("errUnknown")
              : t("errFailed")
        );
        return;
      }
      setPending(null);
      router.refresh();
    } catch {
      setError(t("errFailed"));
    } finally {
      setBusy(false);
    }
  }

  /** Picking an account: a plain link happens straight away; a relink is destructive
   *  (it drops this project's sync target) so it confirms first. */
  function choose(customerId: string) {
    const option = options.find((o) => o.customerId === customerId);
    if (!option) return;
    if (option.claimedBy !== undefined) {
      setError(t("errClaimed"));
      return;
    }
    if (option.action === "relink") setPending({ kind: "relink", customerId });
    else if (option.action === "link") void patch(customerId);
  }

  const confirming = pending
    ? pending.kind === "unlink"
      ? {
          title: t("unlinkTitle"),
          body: t("unlinkLead", {
            project: project.name,
            account: link.customerName ?? link.customerId ?? "",
          }),
          confirm: t("unlinkConfirm"),
          run: () => patch(""),
        }
      : {
          title: t("relinkTitle"),
          body: t("relinkLead", {
            project: project.name,
            current: link.customerId ?? "",
            next: pending.customerId,
          }),
          confirm: t("relinkConfirm"),
          run: () => patch(pending.customerId),
        }
    : null;

  return (
    <section className="mt-8 card max-w-2xl p-6">
      <h3 className="text-sm font-semibold text-navy-800">{t("title")}</h3>
      <p className="mt-1 text-sm text-muted">{t("lead")}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {link.linked ? t("linkedTo") : t("notLinked")}
          </p>
          <p className="tnum mt-0.5 truncate text-sm font-semibold text-navy-800">
            {link.linked
              ? link.customerName
                ? `${link.customerName} · ${link.customerId}`
                : link.customerId
              : accounts.length === 0
                ? t("noAccounts")
                : t("notLinkedHint")}
          </p>
        </div>
        {link.linked && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPending({ kind: "unlink" });
            }}
            className="rounded-pill border border-negative/40 px-3.5 py-1.5 text-sm font-semibold text-negative transition-colors hover:bg-negative-soft"
          >
            {t("unlink")}
          </button>
        )}
      </div>

      {accounts.length > 0 && (
        <label className="mt-4 block">
          <span className="sr-only">{t("choose")}</span>
          <select
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && choose(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
          >
            <option value="" disabled>
              {busy ? t("working") : t("choose")}
            </option>
            {options.map((o) => (
              <option key={o.customerId} value={o.customerId} disabled={o.action === "noop"}>
                {o.claimedBy !== undefined
                  ? t("claimedOption", { name: o.customerName, project: o.claimedBy })
                  : o.action === "noop"
                    ? t("currentOption", { name: o.customerName })
                    : o.action === "relink"
                      ? t("replacesOption", { name: o.customerName, id: link.customerId ?? "" })
                      : o.customerName}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-negative-soft px-3.5 py-2.5 text-sm text-negative">
          {error}
        </p>
      )}

      <Modal
        open={confirming !== null}
        onClose={() => setPending(null)}
        title={confirming?.title}
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-pill px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-navy-700"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={() => confirming?.run()}
              disabled={busy}
              className="rounded-pill bg-coral-600 px-5 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-coral-500 disabled:opacity-60"
            >
              {busy ? t("working") : confirming?.confirm}
            </button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-navy-700">{confirming?.body}</p>
      </Modal>
    </section>
  );
}
