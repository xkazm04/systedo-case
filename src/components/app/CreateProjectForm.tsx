"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import { modulesFor } from "@/lib/projects/modules";
import {
  PROJECT_TYPES,
  PROJECT_TYPE_META,
  type ProjectType,
} from "@/lib/projects/types";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    typeLabel: "Typ projektu",
    typeHint: "Určuje, které moduly se objeví v levém menu a jaké metriky uvidíte v přehledu.",
    modulesFor: "Moduly pro",
    projectName: "Název projektu",
    namePlaceholder: "např. Mionelo",
    website: "Web",
    websiteOptional: "(nepovinné)",
    websitePlaceholder: "mionelo.cz",
    brandColor: "Barva značky",
    colorLabel: "Barva",
    errorEmpty: "Zadejte název projektu.",
    errorCreate: "Nepodařilo se vytvořit projekt.",
    errorGeneric: "Něco se pokazilo.",
    submitting: "Zakládám…",
    submit: "Vytvořit projekt",
    cancel: "Zrušit",
  },
  en: {
    typeLabel: "Project type",
    typeHint: "Determines which modules appear in the left menu and which metrics you see in the overview.",
    modulesFor: "Modules for",
    projectName: "Project name",
    namePlaceholder: "e.g. Mionelo",
    website: "Website",
    websiteOptional: "(optional)",
    websitePlaceholder: "mionelo.com",
    brandColor: "Brand color",
    colorLabel: "Color",
    errorEmpty: "Enter a project name.",
    errorCreate: "Failed to create project.",
    errorGeneric: "Something went wrong.",
    submitting: "Creating…",
    submit: "Create project",
    cancel: "Cancel",
  },
} as const;

/** Accent presets a project can be branded with (brand-ramp + a few extras). */
const ACCENTS = ["#14b8b1", "#0e9c97", "#6366f1", "#8b5cf6", "#fb7141", "#d4503e"];

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-navy-800 placeholder:text-muted/70 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";

export default function CreateProjectForm({
  onCancel,
}: {
  /** Shown only when the user already has projects (so they can back out). */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const t = useT(T);
  const [type, setType] = useState<ProjectType>("eshop");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [accent, setAccent] = useState<string>(PROJECT_TYPE_META.eshop.defaultAccent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickType(t: ProjectType) {
    setType(t);
    setAccent(PROJECT_TYPE_META[t].defaultAccent);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("errorEmpty"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, type, accentColor: accent, domain: domain.trim() || undefined }),
      });
      const json = (await res.json()) as { project?: { id: string }; error?: string };
      if (!res.ok || !json.project) throw new Error(json.error ?? t("errorCreate"));
      router.push(`/app/${json.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
      setSubmitting(false);
    }
  }

  const previewModules = modulesFor(type).filter((m) => m.section !== "system");

  return (
    <form onSubmit={submit} className="space-y-8">
      {/* type picker */}
      <fieldset>
        <legend className="text-sm font-semibold text-navy-800">{t("typeLabel")}</legend>
        <p className="mt-1 text-sm text-muted">
          {t("typeHint")}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PROJECT_TYPES.map((pt) => {
            const meta = PROJECT_TYPE_META[pt];
            const selected = pt === type;
            return (
              <button
                key={pt}
                type="button"
                onClick={() => pickType(pt)}
                aria-pressed={selected}
                className={`relative flex items-start gap-3 rounded-card border p-4 text-left transition-all ${
                  selected
                    ? "border-brand-400 bg-brand-50/60 ring-2 ring-brand-200"
                    : "border-line bg-surface hover:border-brand-300"
                }`}
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white"
                  style={{ backgroundColor: meta.defaultAccent }}
                >
                  <ModuleIcon icon={meta.icon} width={20} height={20} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-navy-800">
                    {meta.label}
                    {selected && <Check width={15} height={15} className="text-brand-accent" />}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{meta.tagline}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* module preview for the chosen type */}
      <div className="rounded-card border border-line bg-canvas px-4 py-3.5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          {`${t("modulesFor")} „${PROJECT_TYPE_META[type].label}“`}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {previewModules.map((m) => (
            <span
              key={m.key || "overview"}
              className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1 text-xs font-medium text-navy-700"
            >
              <ModuleIcon icon={m.icon} width={13} height={13} className="text-brand-accent" />
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* name + domain */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-navy-800">{t("projectName")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className={`mt-1.5 ${inputClass}`}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-navy-800">
            {t("website")} <span className="font-normal text-muted">{t("websiteOptional")}</span>
          </span>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={t("websitePlaceholder")}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
      </div>

      {/* accent */}
      <div>
        <span className="text-sm font-medium text-navy-800">{t("brandColor")}</span>
        <div className="mt-2 flex items-center gap-2">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`${t("colorLabel")} ${c}`}
              aria-pressed={accent === c}
              onClick={() => setAccent(c)}
              className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${
                accent === c ? "ring-2 ring-offset-2 ring-offset-surface" : ""
              }`}
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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? t("submitting") : t("submit")}
          {!submitting && <ArrowRight width={16} height={16} />}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-pill px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-navy-700"
          >
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
