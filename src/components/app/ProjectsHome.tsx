"use client";

import Link from "next/link";
import { useState } from "react";
import { Container } from "@/components/ui";
import { ArrowRight, Logo, Plus } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import CreateProjectForm from "@/components/app/CreateProjectForm";
import ThemeToggle from "@/components/site/ThemeToggle";
import AuthButton from "@/components/auth/AuthButton";
import { modulesFor } from "@/lib/projects/modules";
import { PROJECT_TYPE_META, type Project } from "@/lib/projects/types";

/** The /app landing: the user's project hub, or a first-run onboarding when they
 *  have none. Stands alone (no sidebar) — the shell only wraps a chosen project. */
export default function ProjectsHome({ projects }: { projects: Project[] }) {
  const [creating, setCreating] = useState(false);
  const empty = projects.length === 0;
  const showForm = empty || creating;

  return (
    <div className="min-h-screen bg-canvas">
      {/* slim top strip */}
      <div className="border-b border-line bg-surface/85 backdrop-blur-md">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="group flex items-center gap-2.5" aria-label="Systedo — domů">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-onyx text-brand-400">
              <Logo width={20} height={20} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-tight text-navy-800">Systedo</span>
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Pracovní prostor
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
        <div className="mx-auto max-w-3xl">
          <header className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
              {showForm ? (empty ? "Založte první projekt" : "Nový projekt") : "Vaše projekty"}
            </h1>
            <p className="mt-2 max-w-xl text-muted">
              {showForm
                ? "Projekt je pracovní prostor pro jednoho klienta nebo značku. Jeho typ určí, které moduly a metriky uvidíte."
                : "Vyberte projekt, nebo založte nový. Každý si poskládá vlastní moduly podle svého typu."}
            </p>
          </header>

          {showForm ? (
            <div className="card p-6 sm:p-8">
              <CreateProjectForm onCancel={empty ? undefined : () => setCreating(false)} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="card group flex min-h-[7rem] flex-col items-center justify-center gap-2 border-dashed p-6 text-muted transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-accent transition-colors group-hover:bg-brand-600 group-hover:text-white">
                  <Plus width={20} height={20} />
                </span>
                <span className="text-sm font-semibold">Nový projekt</span>
              </button>
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const meta = PROJECT_TYPE_META[project.type];
  const moduleCount = modulesFor(project.type).filter((m) => m.section !== "system").length;
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
          <ModuleIcon icon={meta.icon} width={22} height={22} />
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
      <p className="mt-3 text-xs font-medium text-muted">{moduleCount} modulů</p>
    </Link>
  );
}
