"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Pill } from "@/components/ui";
import { ArrowRight, Close, Copy, Logo, Plus } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import CreateProjectForm from "@/components/app/CreateProjectForm";
import Modal from "@/components/app/Modal";
import { inputClass } from "@/components/app/create-project-shared";
import ThemeToggle from "@/components/site/ThemeToggle";
import AuthButton from "@/components/auth/AuthButton";
import { modulesFor } from "@/lib/projects/modules";
import { PROJECT_TYPE_META, projectTypeMeta, type Project } from "@/lib/projects/types";
import {
  decideAdsLink,
  projectAdsLink,
  unmappedAccounts,
  type LinkableAccount,
} from "@/lib/projects/ads-link";
import { useT } from "@/lib/i18n/client";
import type { TFn } from "@/lib/i18n/interpolate";
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
    linkFailed: "Přiřazení účtu se nezdařilo. Zkuste to prosím znovu.",
    linkClaimed: "Tento účet už je propojený s jiným projektem. Nejdřív ho tam odpojte.",
    linkUnknown: "Tento účet není mezi vašimi připojenými účty Google Ads.",
    optionReplaces: "nahradí {id}",
    relinkTitle: "Nahradit stávající propojení?",
    relinkLead: "Projekt {project} je teď propojený s účtem {current}. Přiřazením účtu {next} se stávající propojení zruší — data z účtu {current} se do tohoto projektu přestanou synchronizovat.",
    relinkConfirm: "Nahradit propojení",
    unlink: "Odpojit účet",
    unlinkTitle: "Odpojit účet Google Ads?",
    unlinkLead: "Projekt {project} se přestane synchronizovat s účtem {account}. Dosud nasbíraná data zůstanou, nová nepřibudou. Účet můžete kdykoli přiřadit znovu — i jinému projektu.",
    unlinkConfirm: "Odpojit",
    unlinking: "Odpojuji…",
    unlinkFailed: "Odpojení účtu se nezdařilo. Zkuste to prosím znovu.",
    duplicate: "Duplikovat jako šablonu",
    dupTitle: "Duplikovat jako šablonu",
    dupLead: "Vytvoří nový samostatný projekt a zkopíruje do něj nastavení tohoto projektu. Nový klient začíná s prázdnými daty — zkopíruje se jen scaffold, ne provozní data ani přístupy.",
    dupCopiesTitle: "Zkopíruje se",
    dupExcludesTitle: "Nezkopíruje se",
    dupNameLabel: "Název nového projektu",
    dupNamePlaceholder: "např. Klient B",
    dupConfirm: "Duplikovat projekt",
    dupWorking: "Duplikuji…",
    dupError: "Duplikaci se nepodařilo dokončit.",
    dupSuffix: "(kopie)",
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
    linkFailed: "Couldn't map the account. Please try again.",
    linkClaimed: "This account is already linked to another project. Unlink it there first.",
    linkUnknown: "This account isn't among your connected Google Ads accounts.",
    optionReplaces: "replaces {id}",
    relinkTitle: "Replace the existing link?",
    relinkLead: "Project {project} is currently linked to account {current}. Mapping account {next} drops that link — data from account {current} stops syncing into this project.",
    relinkConfirm: "Replace link",
    unlink: "Unlink account",
    unlinkTitle: "Unlink the Google Ads account?",
    unlinkLead: "Project {project} will stop syncing with account {account}. Data collected so far stays; no new data arrives. You can map the account again any time — including to a different project.",
    unlinkConfirm: "Unlink",
    unlinking: "Unlinking…",
    unlinkFailed: "Couldn't unlink the account. Please try again.",
    duplicate: "Duplicate as template",
    dupTitle: "Duplicate as template",
    dupLead: "Creates a new, independent project and copies this project's setup into it. A new client starts with empty data — only the scaffold is copied, never operating data or credentials.",
    dupCopiesTitle: "What's copied",
    dupExcludesTitle: "What's not copied",
    dupNameLabel: "New project name",
    dupNamePlaceholder: "e.g. Client B",
    dupConfirm: "Duplicate project",
    dupWorking: "Duplicating…",
    dupError: "Couldn't complete the duplication.",
    dupSuffix: "(copy)",
  },
} as const;

/** The copied / excluded bullet lists for the duplicate dialog — kept out of the
 *  string-only translation table (useT) because they're arrays. cs is the source. */
const DUP_LISTS = {
  cs: {
    copies: [
      "Typ projektu a barva značky",
      "Katalog (produkty / služby / plány)",
      "Nákladový model a konkurence",
      "Plán organických kanálů",
      "Branding reportu (název, barva, profil klienta)",
    ],
    excludes: [
      "Data a metriky reportu, diagnózy, recapy",
      "Twin, poznámky, LP experimenty",
      "Importy leadů a stav onboardingu",
      "Připojení skladu a přístupy (nikdy)",
      "Doména, logo a napojení Google Ads",
    ],
  },
  en: {
    copies: [
      "Project type and brand color",
      "Catalog (products / services / plans)",
      "Cost model and competitors",
      "Organic-channels plan",
      "Report branding (name, color, client profile)",
    ],
    excludes: [
      "Report data and metrics, diagnoses, recaps",
      "Twin, annotations, LP experiments",
      "Lead imports and onboarding state",
      "Warehouse connection and credentials (never)",
      "Domain, logo and Google Ads link",
    ],
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
              <UnmappedAccountsCallout
                accounts={unmapped}
                allAccounts={accounts}
                projects={projects}
              />
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
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-accent transition-colors group-hover:bg-brand-700 group-hover:text-white">
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

/** PATCH a project's `adsCustomerId` (`""` unlinks). A resolved fetch is NOT a
 *  success — the route refuses a collision (409) and an unverifiable account (422),
 *  and those refusals must reach the user, not be swallowed into a silent refresh.
 *  Returns null on success, else the localized message to show. */
async function patchAdsLink(
  projectId: string,
  customerId: string,
  t: TFn<keyof (typeof T)["cs"]>,
  fallbackKey: "linkFailed" | "unlinkFailed"
): Promise<string | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adsCustomerId: customerId }),
    });
    if (res.ok) return null;
    if (res.status === 409) return t("linkClaimed");
    if (res.status === 422) return t("linkUnknown");
    return t(fallbackKey);
  } catch {
    return t(fallbackKey);
  }
}

/** The unmapped-accounts callout: connected Ads accounts not linked to any project,
 *  each with a one-click picker that PATCHes `adsCustomerId` onto the chosen project
 *  via the existing route, then refreshes so the badge + callout re-derive.
 *
 *  The picker lists every project, including ones that ALREADY carry a different
 *  link — picking one used to overwrite that link silently, with no hint in the
 *  option and no confirmation. Each such option now says what it would replace, and
 *  choosing it opens a confirm first. The common case — a loose account onto an
 *  unlinked project — is unchanged: pick, done, no dialog. */
function UnmappedAccountsCallout({
  accounts,
  allAccounts,
  projects,
}: {
  accounts: LinkableAccount[];
  /** ALL connected accounts (not just the unmapped ones) — the pre-flight rule
   *  resolves the requested id against them, exactly as the server does. */
  allAccounts: LinkableAccount[];
  projects: Project[];
}) {
  const t = useT(T);
  const router = useRouter();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<
    { customerId: string; project: Project; previous: string } | null
  >(null);

  /** Evaluate the SAME rule the API enforces before spending a round-trip, so the
   *  user is warned (relink) or told why (collision) up front. The server stays the
   *  authority — a stale page still gets its 409/422 and shows it. */
  function request(customerId: string, projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    setLinkError(null);
    const verdict = decideAdsLink({ project, customerId, accounts: allAccounts, projects });
    if (!verdict.ok) {
      setLinkError(verdict.reason === "already-claimed" ? t("linkClaimed") : t("linkUnknown"));
      return;
    }
    if (verdict.action === "relink") {
      setConfirming({ customerId, project, previous: verdict.previousCustomerId ?? "" });
      return;
    }
    void link(customerId, projectId);
  }

  async function link(customerId: string, projectId: string) {
    setBusyId(customerId);
    setLinkError(null);
    const message = await patchAdsLink(projectId, customerId, t, "linkFailed");
    setBusyId(null);
    if (message) {
      // Keep the picker open so the user can retry or choose another project.
      setLinkError(message);
      return;
    }
    setConfirming(null);
    setOpenFor(null);
    router.refresh();
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
                    onChange={(e) => e.target.value && request(a.customerId, e.target.value)}
                    className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-navy-800"
                  >
                    <option value="" disabled>
                      {busyId === a.customerId ? t("linking") : t("connectTo")}
                    </option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.adsCustomerId
                          ? `${p.name} — ${t("optionReplaces", { id: p.adsCustomerId })}`
                          : p.name}
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
                  className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
                >
                  {t("connect")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {linkError && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {linkError}
        </p>
      )}

      {/* Relink confirm — the destructive branch of the picker. */}
      <ConfirmLinkChange
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={t("relinkTitle")}
        body={
          confirming
            ? t("relinkLead", {
                project: confirming.project.name,
                current: confirming.previous,
                next: confirming.customerId,
              })
            : ""
        }
        confirmLabel={busyId ? t("linking") : t("relinkConfirm")}
        cancelLabel={t("cancel")}
        busy={busyId !== null}
        onConfirm={() => confirming && link(confirming.customerId, confirming.project.id)}
      />
    </div>
  );
}

/** A confirm dialog for the two destructive Ads-link changes (relink + unlink), over
 *  the shared Modal shell — same footer grammar as DuplicateProjectModal below, so
 *  the three project-level confirmations read as one system. */
function ConfirmLinkChange({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  error,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  onConfirm: () => void;
  error?: string | null;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-navy-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-pill bg-coral-600 px-5 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-coral-500 disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-navy-700">{body}</p>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-negative-soft px-3.5 py-2.5 text-sm text-negative">
          {error}
        </p>
      )}
    </Modal>
  );
}

function ProjectCard({ project, accounts }: { project: Project; accounts: LinkableAccount[] }) {
  const rawMeta = PROJECT_TYPE_META[project.type];
  const { locale } = useLocale();
  const meta = projectTypeMeta(project.type, locale);
  const moduleCount = modulesFor(project.type).filter((m) => m.section !== "system").length;
  const t = useT(T);
  const link = projectAdsLink(project, accounts);
  const [duplicating, setDuplicating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const router = useRouter();

  /** Unlink = PATCH an empty `adsCustomerId`, which the route/normalizer clear to
   *  null. Confirm-gated: it drops the project's sync target, so the numbers stop
   *  moving — exactly the kind of silent change an agency discovers weeks later. */
  async function unlink() {
    setUnlinkBusy(true);
    const message = await patchAdsLink(project.id, "", t, "unlinkFailed");
    setUnlinkBusy(false);
    if (message) {
      setUnlinkError(message);
      return;
    }
    setUnlinking(false);
    setUnlinkError(null);
    router.refresh();
  }

  // Stretched-link pattern: the whole card navigates via an absolute overlay link,
  // so the duplicate control can live ABOVE it (its own stacking context) and stay
  // clickable without nesting an interactive element inside an anchor.
  return (
    <>
      <div className="card group relative flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop">
        <Link
          href={`/app/${project.id}`}
          className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          aria-label={project.name}
        >
          <span className="sr-only">{project.name}</span>
        </Link>
        <div className="flex items-center justify-between">
          <span
            className="grid h-11 w-11 place-items-center rounded-xl text-white"
            style={{ backgroundColor: project.accentColor }}
          >
            <ModuleIcon icon={rawMeta.icon} width={22} height={22} />
          </span>
          <div className="relative z-10 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDuplicating(true)}
              aria-label={t("duplicate")}
              title={t("duplicate")}
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-brand-accent"
            >
              <Copy width={16} height={16} />
            </button>
            <ArrowRight
              width={18}
              height={18}
              className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-brand-accent"
            />
          </div>
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
            // The badge is passive; the unlink control sits beside it, above the
            // stretched card link (own stacking context) so it stays clickable
            // without nesting a button inside the anchor.
            <span className="flex min-w-0 items-center gap-1">
              <span
                className="inline-flex min-w-0 items-center gap-1.5 rounded-pill bg-positive-soft px-2 py-0.5 text-[11px] font-semibold text-positive"
                title={link.customerName ? `${link.customerName} · ${link.customerId}` : link.customerId}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-positive" aria-hidden />
                <span className="truncate">{link.customerName ?? link.customerId}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setUnlinkError(null);
                  setUnlinking(true);
                }}
                aria-label={t("unlink")}
                title={t("unlink")}
                className="relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-negative-soft hover:text-negative"
              >
                <Close width={12} height={12} />
              </button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-navy-300" aria-hidden />
              {t("unlinked")}
            </span>
          )}
        </div>
      </div>
      <DuplicateProjectModal
        project={project}
        open={duplicating}
        onClose={() => setDuplicating(false)}
      />
      <ConfirmLinkChange
        open={unlinking}
        onClose={() => setUnlinking(false)}
        title={t("unlinkTitle")}
        body={t("unlinkLead", {
          project: project.name,
          account: link.customerName ?? link.customerId ?? "",
        })}
        confirmLabel={unlinkBusy ? t("unlinking") : t("unlinkConfirm")}
        cancelLabel={t("cancel")}
        busy={unlinkBusy}
        onConfirm={unlink}
        error={unlinkError}
      />
    </>
  );
}

/** Confirm-gated "duplicate as template" dialog: explains exactly what carries over
 *  (setup) and what doesn't (operating data + credentials), takes the new project's
 *  name, POSTs to the ownership-checked duplicate route, then lands on the copy. */
function DuplicateProjectModal({
  project,
  open,
  onClose,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT(T);
  const { locale } = useLocale();
  const router = useRouter();
  // Locale-correct default suffix (t is already available) — a hardcoded "(kopie)"
  // baked a Czech word into an en-locale user's project name across the whole app.
  const [name, setName] = useState(`${project.name} ${t("dupSuffix")}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/duplicate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = (await res.json()) as { project?: { id: string }; error?: string };
      if (!res.ok || !json.project) throw new Error(json.error ?? t("dupError"));
      router.push(`/app/${json.project.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dupError"));
      setBusy(false);
    }
  }

  const listData = DUP_LISTS[locale] ?? DUP_LISTS.cs;
  const lists: { title: string; items: readonly string[]; tone: "copy" | "skip" }[] = [
    { title: t("dupCopiesTitle"), items: listData.copies, tone: "copy" },
    { title: t("dupExcludesTitle"), items: listData.excludes, tone: "skip" },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("dupTitle")}
      description={t("dupLead")}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-navy-700"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !name.trim()}
            className="inline-flex items-center gap-2 rounded-pill bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-800 disabled:opacity-60"
          >
            <Copy width={15} height={15} />
            {busy ? t("dupWorking") : t("dupConfirm")}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {lists.map((l) => (
            <div
              key={l.title}
              className={`rounded-card border px-3.5 py-3 ${
                l.tone === "copy" ? "border-positive/25 bg-positive-soft" : "border-line bg-canvas"
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wide ${
                  l.tone === "copy" ? "text-positive" : "text-muted"
                }`}
              >
                {l.title}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-navy-700">
                {l.items.map((it) => (
                  <li key={it} className="flex gap-1.5">
                    <span aria-hidden className={l.tone === "copy" ? "text-positive" : "text-muted"}>
                      {l.tone === "copy" ? "✓" : "×"}
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-navy-800">{t("dupNameLabel")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("dupNamePlaceholder")}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>

        {error && (
          <p className="rounded-lg bg-negative-soft px-3.5 py-2.5 text-sm text-negative" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
