"use client";

/** LP experiments — the CONTROL surface for a project's persisted experiments (the
 *  "table" layer of the two-layer table→modal UI). Create a new experiment, edit its
 *  variant counts, close it (status → done) or delete it; the read-only significance
 *  ANALYSIS (evaluate()) stays server-rendered below in LpExperimentsModule. Mutations
 *  POST/PATCH/DELETE the ownership-checked /api/projects/[id]/experiments sub-resource
 *  and then router.refresh() so the server re-resolves live-over-sample and re-runs the
 *  (untouched) evaluate() math. Design-system primitives + shared Modal; cs/en. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { Plus, Close, Check } from "@/components/icons";
import Modal from "@/components/app/Modal";
import { buttonClass } from "@/components/ui";
import {
  VARIANT_MIN,
  VARIANT_MAX,
  CLUSTER_MAX,
  LABEL_MAX,
} from "@/lib/lp-exp/types";
import type { LpExperiment } from "@/lib/lp-exp/sample";

const T = {
  cs: {
    manageTitle: "Vaše experimenty",
    manageIntroLive: "Ruční zadávání návštěvnosti a konverzí. Průkazný vítěz se propíše do AI jako ověřená kreativa účtu.",
    manageIntroSample: "Níže vidíte ukázkové experimenty. Přidejte vlastní — jakmile máte reálná data, vyhodnocení i AI grounding poběží na nich, ne na ukázce.",
    add: "Přidat experiment",
    edit: "Upravit",
    close: "Uzavřít",
    reopen: "Znovu otevřít",
    delete: "Smazat",
    statusRunning: "Běží",
    statusDone: "Ukončeno",
    newTitle: "Nový experiment",
    editTitle: "Upravit experiment",
    clusterLabel: "Klastr klíčových slov",
    clusterPlaceholder: "např. nástroj na řízení projektů",
    variantsLabel: "Varianty (první je kontrola)",
    variantLabelPh: "Popis varianty (např. B · Důraz na šablony)",
    visitors: "Návštěvníci",
    signups: "Konverze",
    addVariant: "Přidat variantu",
    removeVariant: "Odebrat",
    markDone: "Označit jako ukončený",
    save: "Uložit",
    saving: "Ukládám…",
    cancel: "Zrušit",
    deleteConfirm: "Smazat tento experiment?",
    failed: "Akce se nezdařila.",
    invalid: "Vyplňte klastr a alespoň dvě varianty.",
    variantsHint: "Konverze nemohou překročit počet návštěvníků.",
  },
  en: {
    manageTitle: "Your experiments",
    manageIntroLive: "Enter visitors and conversions manually. A significant winner is carried into the AI as an account-proven creative.",
    manageIntroSample: "Below are sample experiments. Add your own — once you have real data, both the verdict and the AI grounding run on it, not on the sample.",
    add: "Add experiment",
    edit: "Edit",
    close: "Close",
    reopen: "Reopen",
    delete: "Delete",
    statusRunning: "Running",
    statusDone: "Completed",
    newTitle: "New experiment",
    editTitle: "Edit experiment",
    clusterLabel: "Keyword cluster",
    clusterPlaceholder: "e.g. project management tool",
    variantsLabel: "Variants (the first is the control)",
    variantLabelPh: "Variant label (e.g. B · Emphasis on templates)",
    visitors: "Visitors",
    signups: "Conversions",
    addVariant: "Add variant",
    removeVariant: "Remove",
    markDone: "Mark as completed",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    deleteConfirm: "Delete this experiment?",
    failed: "Action failed.",
    invalid: "Fill in the cluster and at least two variants.",
    variantsHint: "Conversions cannot exceed the number of visitors.",
  },
} as const;

interface VariantDraft {
  label: string;
  visitors: string;
  signups: string;
}

function blankVariant(i: number): VariantDraft {
  return { label: i === 0 ? "A · Kontrola" : "", visitors: "", signups: "" };
}

function draftFrom(exp: LpExperiment): { cluster: string; status: LpExperiment["status"]; variants: VariantDraft[] } {
  return {
    cluster: exp.cluster,
    status: exp.status,
    variants: exp.variants.map((v) => ({
      label: v.label,
      visitors: String(v.visitors),
      signups: String(v.signups),
    })),
  };
}

export default function LpExperimentsManager({
  projectId,
  experiments,
  source,
}: {
  projectId: string;
  experiments: LpExperiment[];
  source: "sample" | "live";
}) {
  const t = useT(T);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [cluster, setCluster] = useState("");
  const [status, setStatus] = useState<LpExperiment["status"]>("running");
  const [variants, setVariants] = useState<VariantDraft[]>([blankVariant(0), blankVariant(1)]);

  function openNew() {
    setEditingId(null);
    setCluster("");
    setStatus("running");
    setVariants([blankVariant(0), blankVariant(1)]);
    setErr(null);
    setOpen(true);
  }

  function openEdit(exp: LpExperiment) {
    const d = draftFrom(exp);
    setEditingId(exp.id);
    setCluster(d.cluster);
    setStatus(d.status);
    setVariants(d.variants);
    setErr(null);
    setOpen(true);
  }

  function setVariantAt(i: number, patch: Partial<VariantDraft>) {
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }

  function addVariantRow() {
    setVariants((prev) => (prev.length >= VARIANT_MAX ? prev : [...prev, blankVariant(prev.length)]));
  }

  function removeVariantRow(i: number) {
    setVariants((prev) => (prev.length <= VARIANT_MIN ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function buildBody() {
    return {
      cluster: cluster.trim(),
      status,
      variants: variants
        .map((v) => ({
          label: v.label.trim(),
          visitors: Number(v.visitors) || 0,
          signups: Number(v.signups) || 0,
        }))
        .filter((v) => v.label || v.visitors || v.signups),
    };
  }

  async function save() {
    const body = buildBody();
    if (!body.cluster || body.variants.length < VARIANT_MIN) {
      setErr(t("invalid"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = editingId
        ? await fetch(`/api/projects/${projectId}/experiments?id=${encodeURIComponent(editingId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/projects/${projectId}/experiments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setErr(json.error || t("failed"));
      }
    } catch {
      setErr(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleClose(exp: LpExperiment) {
    setBusy(true);
    try {
      const body = { ...draftFromExp(exp), status: exp.status === "done" ? "running" : "done" };
      const res = await fetch(`/api/projects/${projectId}/experiments?id=${encodeURIComponent(exp.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(exp: LpExperiment) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/experiments?id=${encodeURIComponent(exp.id)}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-navy-800">{t("manageTitle")}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            {source === "live" ? t("manageIntroLive") : t("manageIntroSample")}
          </p>
        </div>
        <button type="button" onClick={openNew} disabled={busy} className={buttonClass("primary", "sm")}>
          <Plus width={15} height={15} />
          {t("add")}
        </button>
      </div>

      {source === "live" && experiments.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {experiments.map((exp) => (
            <li key={exp.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <span className="block truncate text-sm font-medium text-navy-800">{exp.cluster}</span>
                <span className="text-xs text-muted">
                  {exp.status === "done" ? t("statusDone") : t("statusRunning")} · {exp.variants.length}×
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openEdit(exp)}
                  disabled={busy}
                  className="rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
                >
                  {t("edit")}
                </button>
                <button
                  type="button"
                  onClick={() => toggleClose(exp)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
                >
                  {exp.status === "done" ? t("reopen") : <><Check width={12} height={12} /> {t("close")}</>}
                </button>
                <button
                  type="button"
                  onClick={() => remove(exp)}
                  disabled={busy}
                  className="rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-negative transition-colors hover:border-negative/40 disabled:opacity-50"
                >
                  {t("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? t("editTitle") : t("newTitle")}
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            {err && <span className="mr-auto text-sm text-negative">{err}</span>}
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>
              {t("cancel")}
            </button>
            <button type="button" onClick={save} disabled={busy} className={buttonClass("primary", "sm")}>
              {busy ? t("saving") : t("save")}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy-800">{t("clusterLabel")}</span>
            <input
              type="text"
              value={cluster}
              maxLength={CLUSTER_MAX}
              onChange={(e) => setCluster(e.target.value)}
              placeholder={t("clusterPlaceholder")}
              className="w-full rounded-card border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-300 focus:outline-none"
            />
          </label>

          <div>
            <span className="mb-1 block text-sm font-medium text-navy-800">{t("variantsLabel")}</span>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={v.label}
                    maxLength={LABEL_MAX}
                    onChange={(e) => setVariantAt(i, { label: e.target.value })}
                    placeholder={t("variantLabelPh")}
                    className="min-w-[10rem] flex-1 rounded-card border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-300 focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    value={v.visitors}
                    onChange={(e) => setVariantAt(i, { visitors: e.target.value })}
                    placeholder={t("visitors")}
                    aria-label={t("visitors")}
                    className="tnum w-28 rounded-card border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-300 focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    value={v.signups}
                    onChange={(e) => setVariantAt(i, { signups: e.target.value })}
                    placeholder={t("signups")}
                    aria-label={t("signups")}
                    className="tnum w-28 rounded-card border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-300 focus:outline-none"
                  />
                  {variants.length > VARIANT_MIN && (
                    <button
                      type="button"
                      onClick={() => removeVariantRow(i)}
                      aria-label={t("removeVariant")}
                      className="rounded-full p-1.5 text-muted transition-colors hover:bg-canvas hover:text-negative"
                    >
                      <Close width={15} height={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={addVariantRow}
                disabled={variants.length >= VARIANT_MAX}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-accent hover:text-brand-800 disabled:opacity-40"
              >
                <Plus width={13} height={13} />
                {t("addVariant")}
              </button>
              <span className="text-xs text-muted">{t("variantsHint")}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-navy-800">
            <input
              type="checkbox"
              checked={status === "done"}
              onChange={(e) => setStatus(e.target.checked ? "done" : "running")}
              className="h-4 w-4 accent-brand-600"
            />
            {t("markDone")}
          </label>
        </div>
      </Modal>
    </div>
  );
}

/** The edit-body for a close/reopen toggle: carry the experiment's current fields so the
 *  PATCH (a full replace by id) only changes the status. Kept inline (not shared with the
 *  modal draft) so the toggle needs no form state. */
function draftFromExp(exp: LpExperiment): { cluster: string; variants: LpExperiment["variants"] } {
  return { cluster: exp.cluster, variants: exp.variants };
}
