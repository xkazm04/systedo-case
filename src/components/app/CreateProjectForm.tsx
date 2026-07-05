"use client";

/** Create-project form — single-step comparison matrix.
 *  Project types are columns, modules are rows (each with a one-line description).
 *  Pick a type by its column header; the active column's cells become live toggles
 *  you click straight in the grid (core is locked on, proposed additions toggle in
 *  coral). "Reset" restores the type's default package. Name/brand + create live on
 *  the same screen — no separate customize step. */
import { Fragment, useState } from "react";
import { ArrowRight, Check } from "@/components/icons";
import { Pill } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  MODULES,
  SECTION_ORDER,
  moduleBlurb,
  moduleLabel,
  sectionLabel,
  type ModuleDef,
  type ModuleSection,
} from "@/lib/projects/modules";
import {
  PROJECT_TYPES,
  PROJECT_TYPE_META,
  projectTypeMeta,
  type ProjectType,
} from "@/lib/projects/types";
import { defaultNatureFor } from "@/lib/catalog/starter";
import type { OfferingNature } from "@/lib/catalog/offering";
import { defaultModules, moduleStatus, packageSize, type ModuleStatus } from "./create-project-packages";
import { ProjectDetailsFields, useProjectDraft } from "./create-project-shared";

const T = {
  cs: {
    heading: "Vyberte typ a poskládejte moduly",
    hint: "Klikněte na typ v hlavičce sloupce, pak přímo v mřížce zapínejte a vypínejte moduly. Kdykoli obnovíte výchozí sadu.",
    colModule: "Modul",
    modulesShort: "modulů",
    modulesOn: "zapnuto",
    system: "Systém",
    reset: "Obnovit výchozí",
    legendCore: "vždy zapnuto",
    legendOn: "zapnuto",
    legendProposed: "navrženo",
    natureHeading: "Povaha podnikání",
    natureHint: "Určuje výchozí katalog nového projektu (online prodej vs. lokální provozovna). Kdykoli upravíte v Katalogu.",
    onlineLabel: "Online",
    onlineDesc: "Prodej či služby online, doručení po celé ČR.",
    localLabel: "Lokální",
    localDesc: "Provozovna nebo výjezd — vázáno na místo.",
    hybridLabel: "Kombinace",
    hybridDesc: "Online i lokálně současně.",
    create: "Vytvořit projekt",
    submitting: "Zakládám…",
    cancel: "Zrušit",
  },
  en: {
    heading: "Choose a type and assemble modules",
    hint: "Click a type in the column header, then toggle modules on and off right in the grid. Reset to the default set anytime.",
    colModule: "Module",
    modulesShort: "modules",
    modulesOn: "on",
    system: "System",
    reset: "Reset to default",
    legendCore: "always on",
    legendOn: "on",
    legendProposed: "proposed",
    natureHeading: "Business nature",
    natureHint: "Sets the new project's starter catalog (online sales vs. a local presence). Edit anytime in Catalog.",
    onlineLabel: "Online",
    onlineDesc: "Sold or served online, shipped nationwide.",
    localLabel: "Local",
    localDesc: "A storefront or on-site visits — tied to a place.",
    hybridLabel: "Hybrid",
    hybridDesc: "Both online and local.",
    create: "Create project",
    submitting: "Creating…",
    cancel: "Cancel",
  },
} as const;

function groupedModules(): [ModuleSection, ModuleDef[]][] {
  return SECTION_ORDER.map((s) => [s, MODULES.filter((m) => m.section === s)] as [ModuleSection, ModuleDef[]]);
}

/** Read-only comparison mark for a non-active column. */
function InactiveMark({ status }: { status: ModuleStatus }) {
  if (status === "core") return <span className="text-navy-500">◆</span>;
  if (status === "on") return <span className="font-semibold text-brand-500">✓</span>;
  if (status === "add") return <span className="font-bold text-coral-400">+</span>;
  return <span className="text-navy-200">·</span>;
}

export default function CreateProjectForm({
  onCancel,
}: {
  /** Shown only when the user already has projects (so they can back out). */
  onCancel?: () => void;
}) {
  const t = useT(T);
  const { locale } = useLocale();
  const draft = useProjectDraft();
  const [type, setType] = useState<ProjectType>("eshop");
  const [accent, setAccent] = useState(PROJECT_TYPE_META.eshop.defaultAccent);
  const [enabled, setEnabled] = useState<Set<string>>(() => defaultModules("eshop"));
  const [nature, setNature] = useState<OfferingNature>(() => defaultNatureFor("eshop"));

  function pickType(pt: ProjectType) {
    setType(pt);
    setAccent(PROJECT_TYPE_META[pt].defaultAccent);
    setEnabled(defaultModules(pt));
    setNature(defaultNatureFor(pt));
  }
  function toggle(key: string) {
    setEnabled((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }
  function reset() {
    setEnabled(defaultModules(type));
  }

  const def = defaultModules(type);
  const atDefault = def.size === enabled.size && [...def].every((k) => enabled.has(k));
  const groups = groupedModules();
  const natureOptions: { key: OfferingNature; label: string; desc: string }[] = [
    { key: "online", label: t("onlineLabel"), desc: t("onlineDesc") },
    { key: "local", label: t("localLabel"), desc: t("localDesc") },
    { key: "hybrid", label: t("hybridLabel"), desc: t("hybridDesc") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-sm font-semibold text-navy-800">{t("heading")}</h2>
          <p className="mt-1 text-sm text-muted">{t("hint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="brand">
            {enabled.size} {t("modulesOn")}
          </Pill>
          <button
            type="button"
            onClick={reset}
            disabled={atDefault}
            className="rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand-300 hover:text-brand-accent disabled:cursor-default disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
          >
            {t("reset")}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-line px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted">
                {t("colModule")}
              </th>
              {PROJECT_TYPES.map((pt) => {
                const active = pt === type;
                return (
                  <th
                    key={pt}
                    className={`border-b border-l border-line p-0 text-center ${active ? "bg-brand-50" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => pickType(pt)}
                      aria-pressed={active}
                      className={`w-full px-2 py-2 transition-colors ${active ? "" : "hover:bg-canvas"}`}
                    >
                      <span className={`block text-[13px] font-semibold ${active ? "text-brand-accent" : "text-navy-800"}`}>
                        {projectTypeMeta(pt, locale).label}
                      </span>
                      <span className="tnum mt-0.5 block text-[11px] text-muted">
                        {active ? enabled.size : packageSize(pt)} {t("modulesShort")}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map(([sec, list]) =>
              list.length === 0 ? null : (
                <Fragment key={sec}>
                  <tr>
                    <td
                      colSpan={PROJECT_TYPES.length + 1}
                      className="border-b border-line bg-canvas px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"
                    >
                      {sectionLabel(sec, locale) || t("system")}
                    </td>
                  </tr>
                  {list.map((m) => (
                    <tr key={m.key || "overview"}>
                      <td className="border-b border-line/70 px-3 py-2 align-top">
                        <div className="font-medium text-navy-800">{moduleLabel(m, locale)}</div>
                        <div className="text-xs leading-snug text-muted">{moduleBlurb(m, locale)}</div>
                      </td>
                      {PROJECT_TYPES.map((pt) => {
                        const active = pt === type;
                        const st = moduleStatus(m, pt);
                        const on = enabled.has(m.key);
                        return (
                          <td
                            key={pt}
                            className={`border-b border-l border-line/70 p-0 text-center align-middle ${
                              active ? "bg-brand-50/40" : ""
                            }`}
                          >
                            {active ? (
                              st === "core" ? (
                                <span
                                  title={t("legendCore")}
                                  className="mx-auto grid h-5 w-5 place-items-center rounded-md bg-brand-600/75 text-white"
                                >
                                  <Check width={13} height={13} />
                                </span>
                              ) : st === "no" ? (
                                <span className="text-navy-200">·</span>
                              ) : (
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={on}
                                  aria-label={moduleLabel(m, locale)}
                                  onClick={() => toggle(m.key)}
                                  className="grid h-full w-full place-items-center py-1.5"
                                >
                                  <span
                                    className={`grid h-5 w-5 place-items-center rounded-md border transition-colors ${
                                      on
                                        ? st === "add"
                                          ? "border-coral-500 bg-coral-500 text-white"
                                          : "border-brand-600 bg-brand-600 text-white"
                                        : `bg-surface text-transparent ${st === "add" ? "border-dashed border-coral-300" : "border-navy-300"}`
                                    }`}
                                  >
                                    <Check width={13} height={13} />
                                  </span>
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() => pickType(pt)}
                                aria-label={projectTypeMeta(pt, locale).label}
                                className="grid h-full w-full place-items-center py-2 opacity-70 transition-opacity hover:opacity-100"
                              >
                                <InactiveMark status={st} />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              )
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-navy-500">◆</span> {t("legendCore")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="grid h-4 w-4 place-items-center rounded bg-brand-600 text-white">
            <Check width={10} height={10} />
          </span>
          {t("legendOn")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-bold text-coral-500">+</span> {t("legendProposed")}
        </span>
      </div>

      <div>
        <span className="text-sm font-medium text-navy-800">{t("natureHeading")}</span>
        <p className="mt-0.5 text-xs text-muted">{t("natureHint")}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {natureOptions.map((n) => {
            const active = nature === n.key;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => setNature(n.key)}
                aria-pressed={active}
                className={`rounded-card border px-3.5 py-2.5 text-left transition-colors ${
                  active
                    ? "border-brand-400 bg-brand-50 ring-1 ring-brand-200"
                    : "border-line hover:border-brand-300"
                }`}
              >
                <span className="block text-sm font-semibold text-navy-800">{n.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{n.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ProjectDetailsFields
        name={draft.name}
        setName={draft.setName}
        domain={draft.domain}
        setDomain={draft.setDomain}
        accent={accent}
        setAccent={setAccent}
      />

      {draft.error && (
        <p className="rounded-lg bg-negative-soft px-3.5 py-2.5 text-sm text-negative" role="alert">
          {draft.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => draft.submit(type, accent, nature)}
          disabled={draft.submitting}
          className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {draft.submitting ? t("submitting") : t("create")}
          {!draft.submitting && <ArrowRight width={16} height={16} />}
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
    </div>
  );
}
