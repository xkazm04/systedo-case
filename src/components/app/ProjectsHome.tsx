"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Pill } from "@/components/ui";
import { ArrowRight, Logo, Plus } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import CreateProjectForm from "@/components/app/CreateProjectForm";
import ThemeToggle from "@/components/site/ThemeToggle";
import AuthButton from "@/components/auth/AuthButton";
import { modulesFor } from "@/lib/projects/modules";
import { PROJECT_TYPE_META, projectTypeMeta, type Project } from "@/lib/projects/types";
import {
  projectAdsLink,
  unmappedAccounts,
  type LinkableAccount,
} from "@/lib/projects/ads-link";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: {
    homeLabel: "Adamant — domů",
    workspace: "Pracovní prostor",
    headingFirst: "Založte první projekt",
    headingNew: "Nový projekt",
    headingList: "Vaše projekty",
    bodyForm: "Projekt je pracovní prostor pro jednoho klienta nebo značku. Jeho typ určí, které moduly a metriky uvidíte.",
    bodyList: "Vyberte projekt, nebo založte nový. Každý si poskládá vlastní moduly podle svého typu.",
    trialKicker: "Zkušební prostor je připravený",
    trialWelcome: "Založte první projekt — načte se s ukázkovými daty, takže hned uvidíte celý živý produkt v akci. Svoje reálné údaje (Google Ads, marže, pozice) připojíte, až budete chtít. Bez karty, kdykoli smažete.",
    newProject: "Nový projekt",
    modules: "modulů",
    linked: "Propojeno",
    unlinked: "Bez propojení",
    unmappedTitle: "Nepřiřazené účty Google Ads",
    unmappedLead: "Tyto připojené účty zatím nepatří k žádnému projektu. Přiřaďte je, aby se jejich data zobrazila ve správném projektu.",
    connect: "Propojit",
    connectTo: "Přiřadit k projektu",
    cancel: "Zrušit",
    linking: "Přiřazuji…",
  },
  en: {
    homeLabel: "Adamant — home",
    workspace: "Workspace",
    headingFirst: "Create your first project",
    headingNew: "New project",
    headingList: "Your projects",
    bodyForm: "A project is a workspace for a single client or brand. Its type determines which modules and metrics you see.",
    bodyList: "Select a project, or create a new one. Each assembles its own modules based on its type.",
    trialKicker: "Your trial workspace is ready",
    trialWelcome: "Create your first project — it loads with sample data so you see the whole live product in action right away. Connect your real data (Google Ads, margins, ranks) whenever you're ready. No card, delete anytime.",
    newProject: "New project",
    modules: "modules",
    linked: "Linked",
    unlinked: "Not linked",
    unmappedTitle: "Unmapped Google Ads accounts",
    unmappedLead: "These connected accounts aren't attached to any project yet. Map them so their data shows up in the right project.",
    connect: "Link",
    connectTo: "Map to a project",
    cancel: "Cancel",
    linking: "Linking…",
  },
} as const;

/** The /app landing: the user's project hub, or a first-run onboarding when they
 *  have none. Stands alone (no sidebar) — the shell only wraps a chosen project. */
export default function ProjectsHome({
  projects,
  accounts = [],
}: {
  projects: Project[];
  /** The user's connected Google Ads accounts (user-level, best-effort). Drives the
   *  per-project link badge + the unmapped-accounts callout. */
  accounts?: LinkableAccount[];
}) {
  const [creating, setCreating] = useState(false);
  const empty = projects.length === 0;
  const showForm = empty || creating;
  const t = useT(T);
  const unmapped = unmappedAccounts(accounts, projects);

  return (
    <div className="min-h-screen bg-canvas">
      {/* slim top strip */}
      <div className="border-b border-line bg-surface/85 backdrop-blur-md">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="group flex items-center gap-2.5" aria-label={t("homeLabel")}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-onyx text-brand-400">
              <Logo width={20} height={20} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[17px] font-semibold tracking-tight text-navy-800">Adamant</span>
              <span className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">
                {t("workspace")}
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <AuthButton />
            <ThemeToggle />
          </div>
        </Container>
      </div>

      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-[62rem]">
          {/* B3: a first-run visitor (no projects) is a prospective buyer fresh off
              the public demo — frame the empty state as a real, free trial workspace. */}
          {empty && (
            <div className="mb-6 rounded-xl border border-positive/25 bg-positive-soft px-5 py-4">
              <p className="text-sm font-semibold text-positive">{t("trialKicker")}</p>
              <p className="mt-1 text-sm leading-relaxed text-navy-700">{t("trialWelcome")}</p>
            </div>
          )}

          <header className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
              {showForm ? (empty ? t("headingFirst") : t("headingNew")) : t("headingList")}
            </h1>
            <p className="mt-2 max-w-xl text-muted">
              {showForm ? t("bodyForm") : t("bodyList")}
            </p>
          </header>

          {showForm ? (
            <div className="card p-6 sm:p-8">
              <CreateProjectForm onCancel={empty ? undefined : () => setCreating(false)} />
            </div>
          ) : (
            <>
            {unmapped.length > 0 && (
              <UnmappedAccountsCallout accounts={unmapped} projects={projects} />
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} accounts={accounts} />
              ))}
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="card group flex min-h-[7rem] flex-col items-center justify-center gap-2 border-dashed p-6 text-muted transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-accent transition-colors group-hover:bg-brand-600 group-hover:text-white">
                  <Plus width={20} height={20} />
                </span>
                <span className="text-sm font-semibold">{t("newProject")}</span>
              </button>
            </div>
            </>
          )}
        </div>
      </Container>
    </div>
  );
}

/** The unmapped-accounts callout: connected Ads accounts not linked to any project,
 *  each with a one-click picker that PATCHes `adsCustomerId` onto the chosen project
 *  via the existing route, then refreshes so the badge + callout re-derive. */
function UnmappedAccountsCallout({
  accounts,
  projects,
}: {
  accounts: LinkableAccount[];
  projects: Project[];
}) {
  const t = useT(T);
  const router = useRouter();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function link(customerId: string, projectId: string) {
    setBusyId(customerId);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adsCustomerId: customerId }),
      });
      setOpenFor(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-coral-500/25 bg-coral-50 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-navy-800">{t("unmappedTitle")}</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{t("unmappedLead")}</p>
        </div>
        <Pill tone="coral">{accounts.length}</Pill>
      </div>
      <ul className="mt-3 space-y-2">
        {accounts.map((a) => (
          <li
            key={a.customerId}
            className="rounded-card border border-line bg-surface px-3.5 py-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-navy-800">{a.customerName}</p>
                <p className="tnum text-xs text-muted">{a.customerId}</p>
              </div>
              {openFor === a.customerId ? (
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`map-${a.customerId}`}>
                    {t("connectTo")}
                  </label>
                  <select
                    id={`map-${a.customerId}`}
                    defaultValue=""
                    disabled={busyId === a.customerId}
                    onChange={(e) => e.target.value && link(a.customerId, e.target.value)}
                    className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-navy-800"
                  >
                    <option value="" disabled>
                      {busyId === a.customerId ? t("linking") : t("connectTo")}
                    </option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setOpenFor(null)}
                    className="text-sm font-medium text-muted hover:text-navy-800"
                  >
                    {t("cancel")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenFor(a.customerId)}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  {t("connect")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectCard({ project, accounts }: { project: Project; accounts: LinkableAccount[] }) {
  const rawMeta = PROJECT_TYPE_META[project.type];
  const { locale } = useLocale();
  const meta = projectTypeMeta(project.type, locale);
  const moduleCount = modulesFor(project.type).filter((m) => m.section !== "system").length;
  const t = useT(T);
  const link = projectAdsLink(project, accounts);
  return (
    <Link
      href={`/app/${project.id}`}
      className="card group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div className="flex items-center justify-between">
        <span
          className="grid h-11 w-11 place-items-center rounded-xl text-white"
          style={{ backgroundColor: project.accentColor }}
        >
          <ModuleIcon icon={rawMeta.icon} width={22} height={22} />
        </span>
        <ArrowRight
          width={18}
          height={18}
          className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-brand-accent"
        />
      </div>
      <h2 className="mt-4 truncate text-lg font-semibold text-navy-800">{project.name}</h2>
      <p className="mt-0.5 text-sm text-muted">
        {meta.label}
        {project.domain ? ` · ${project.domain}` : ""}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{moduleCount} {t("modules")}</p>
        {/* Honest Ads-link badge straight off project.adsCustomerId — no extra read. */}
        {link.linked ? (
          <span
            className="inline-flex max-w-[60%] items-center gap-1.5 rounded-pill bg-positive-soft px-2 py-0.5 text-[11px] font-semibold text-positive"
            title={link.customerName ? `${link.customerName} · ${link.customerId}` : link.customerId}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-positive" aria-hidden />
            <span className="truncate">{link.customerName ?? link.customerId}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-navy-300" aria-hidden />
            {t("unlinked")}
          </span>
        )}
      </div>
    </Link>
  );
}
