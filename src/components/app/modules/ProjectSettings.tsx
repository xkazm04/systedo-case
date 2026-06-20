"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "@/components/icons";
import { Pill } from "@/components/ui";
import { ModuleIcon } from "@/components/app/icon-map";
import { useProject } from "@/lib/projects/context";
import { projectDataSource } from "@/lib/project-data/source";
import {
  PROJECT_TYPES,
  PROJECT_TYPE_META,
  type ProjectType,
} from "@/lib/projects/types";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    dataSourceTitle: "Zdroj dat",
    dataSourceLive: "Projekt používá živá data z Google Ads.",
    dataSourceDemo: "Připojte Google Ads účet v modulu Kampaně pro živá data.",
    projectName: "Název projektu",
    website: "Web",
    websiteOptional: "(nepovinné)",
    projectType: "Typ projektu",
    projectTypeHint: "Změna typu upraví moduly v levém menu i metriky v přehledu.",
    brandColor: "Barva značky",
    colorAria: "Barva {color}",
    saveBtn: "Uložit změny",
    savingBtn: "Ukládám…",
    savedLabel: "Uloženo",
    errorRequired: "Zadejte název projektu.",
    errorSaveFailed: "Uložení se nezdařilo.",
    errorGeneric: "Něco se pokazilo.",
    dangerTitle: "Smazat projekt",
    dangerHint: "Odebere projekt z vašeho pracovního prostoru. Tuto akci nelze vrátit zpět.",
    confirmDelete: "Opravdu smazat „{name}“",
    cancelBtn: "Zrušit",
    deleteBtn: "Smazat projekt",
  },
  en: {
    dataSourceTitle: "Data source",
    dataSourceLive: "This project uses live data from Google Ads.",
    dataSourceDemo: "Connect a Google Ads account in the Campaigns module for live data.",
    projectName: "Project name",
    website: "Website",
    websiteOptional: "(optional)",
    projectType: "Project type",
    projectTypeHint: "Changing the type updates the sidebar modules and the overview metrics.",
    brandColor: "Brand color",
    colorAria: "Color {color}",
    saveBtn: "Save changes",
    savingBtn: "Saving…",
    savedLabel: "Saved",
    errorRequired: "Please enter a project name.",
    errorSaveFailed: "Save failed.",
    errorGeneric: "Something went wrong.",
    dangerTitle: "Delete project",
    dangerHint: "Removes the project from your workspace. This action cannot be undone.",
    confirmDelete: "Really delete “{name}”",
    cancelBtn: "Cancel",
    deleteBtn: "Delete project",
  },
} as const;

const ACCENTS = ["#14b8b1", "#0e9c97", "#6366f1", "#8b5cf6", "#fb7141", "#d4503e"];

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-navy-800 placeholder:text-muted/70 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";

export default function ProjectSettings() {
  const t = useT(T);
  const project = useProject();
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [domain, setDomain] = useState(project.domain ?? "");
  const [type, setType] = useState<ProjectType>(project.type);
  const [accent, setAccent] = useState(project.accentColor);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty =
    name !== project.name ||
    domain !== (project.domain ?? "") ||
    type !== project.type ||
    accent !== project.accentColor;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("errorRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, domain, type, accentColor: accent }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? t("errorSaveFailed"));
      }
      setSaved(true);
      router.refresh(); // re-render the shell (sidebar/switcher) with the new values
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      router.push("/app");
      router.refresh();
    } catch {
      setSaving(false);
    }
  }

  const ds = projectDataSource(project);

  return (
    <div className="max-w-2xl space-y-8">
      <div className="card flex items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm font-semibold text-navy-800">{t("dataSourceTitle")}</p>
          <p className="mt-0.5 text-xs text-muted">
            {ds.live ? t("dataSourceLive") : t("dataSourceDemo")}
          </p>
        </div>
        <Pill tone={ds.live ? "positive" : "neutral"}>{ds.label}</Pill>
      </div>

      <form onSubmit={save} className="card space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-navy-800">{t("projectName")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1.5 ${inputClass}`} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-navy-800">
              {t("website")} <span className="font-normal text-muted">{t("websiteOptional")}</span>
            </span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="mionelo.cz"
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
        </div>

        <div>
          <span className="text-sm font-medium text-navy-800">{t("projectType")}</span>
          <p className="mt-0.5 text-xs text-muted">{t("projectTypeHint")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {PROJECT_TYPES.map((pt) => {
              const meta = PROJECT_TYPE_META[pt];
              const selected = pt === type;
              return (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setType(pt)}
                  aria-pressed={selected}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
                    selected ? "border-brand-400 bg-brand-50/60 ring-2 ring-brand-200" : "border-line hover:border-brand-300"
                  }`}
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
                    style={{ backgroundColor: meta.defaultAccent }}
                  >
                    <ModuleIcon icon={meta.icon} width={16} height={16} />
                  </span>
                  <span className="flex-1 text-sm font-medium text-navy-800">{meta.label}</span>
                  {selected && <Check width={15} height={15} className="text-brand-accent" />}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-navy-800">{t("brandColor")}</span>
          <div className="mt-2 flex items-center gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t("colorAria", { color: c })}
                aria-pressed={accent === c}
                onClick={() => setAccent(c)}
                className="h-8 w-8 rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: c, boxShadow: accent === c ? `0 0 0 2px ${c}` : undefined }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-negative-soft px-3.5 py-2.5 text-sm text-negative" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-line pt-5">
          <button
            type="submit"
            disabled={saving || !dirty}
            className="rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? t("savingBtn") : t("saveBtn")}
          </button>
          {saved && !dirty && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-positive">
              <Check width={15} height={15} /> {t("savedLabel")}
            </span>
          )}
        </div>
      </form>

      {/* danger zone */}
      <div className="card border-negative/30 p-6">
        <h3 className="text-sm font-semibold text-navy-800">{t("dangerTitle")}</h3>
        <p className="mt-1 text-sm text-muted">{t("dangerHint")}</p>
        {confirmDelete ? (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="rounded-pill bg-negative px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t("confirmDelete", { name: project.name })}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-sm font-medium text-muted hover:text-navy-700"
            >
              {t("cancelBtn")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-4 rounded-pill border border-negative/40 px-4 py-2 text-sm font-semibold text-negative transition-colors hover:bg-negative-soft"
          >
            {t("deleteBtn")}
          </button>
        )}
      </div>
    </div>
  );
}
