"use client";

/** Shared building blocks for the create-project form: the draft state + submit
 *  and the name/website/brand-accent fields (kept out of the matrix component so
 *  each stays focused). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import type { ProjectType } from "@/lib/projects/types";

/** Accent presets a project can be branded with (brand-ramp + a few extras). */
export const ACCENTS = ["#14b8b1", "#0e9c97", "#6366f1", "#8b5cf6", "#fb7141", "#d4503e"];

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-navy-800 placeholder:text-muted/70 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";

const T = {
  cs: {
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
  },
  en: {
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
  },
} as const;

/** Draft state + submit. PROTOTYPE: the chosen module set is captured by the caller
 *  but not yet sent — persisting a per-project modules[] is the implementation
 *  follow-up; submit posts today's payload. */
export function useProjectDraft() {
  const router = useRouter();
  const t = useT(T);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(type: ProjectType, accent: string) {
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

  return { name, setName, domain, setDomain, submitting, error, submit };
}

/** Name + website + brand-accent fields. */
export function ProjectDetailsFields({
  name,
  setName,
  domain,
  setDomain,
  accent,
  setAccent,
}: {
  name: string;
  setName: (v: string) => void;
  domain: string;
  setDomain: (v: string) => void;
  accent: string;
  setAccent: (v: string) => void;
}) {
  const t = useT(T);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-navy-800">{t("projectName")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className={`mt-1.5 ${inputClass}`}
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
    </div>
  );
}
