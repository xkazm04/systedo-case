"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import { useProject, useProjects } from "@/lib/projects/context";
import { PROJECT_TYPE_META, type Project } from "@/lib/projects/types";

/** Small square brand tile showing the project's type icon in its accent colour. */
function ProjectGlyph({ project, size = 34 }: { project: Project; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg text-white"
      style={{ width: size, height: size, backgroundColor: project.accentColor }}
    >
      <ModuleIcon
        icon={PROJECT_TYPE_META[project.type].icon}
        width={size * 0.5}
        height={size * 0.5}
      />
    </span>
  );
}

export default function ProjectSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const project = useProject();
  const projects = useProjects();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function go() {
    setOpen(false);
    onNavigate?.();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:border-brand-300"
      >
        <ProjectGlyph project={project} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-navy-800">{project.name}</span>
          <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted">
            {PROJECT_TYPE_META[project.type].label}
          </span>
        </span>
        <ChevronDown
          width={16}
          height={16}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-drop absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        >
          <div className="max-h-72 overflow-y-auto p-1.5">
            {projects.map((p) => {
              const active = p.id === project.id;
              return (
                <Link
                  key={p.id}
                  href={`/app/${p.id}`}
                  onClick={go}
                  role="menuitem"
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                    active ? "bg-brand-50" : "hover:bg-navy-50"
                  }`}
                >
                  <ProjectGlyph project={p} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-navy-800">{p.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {PROJECT_TYPE_META[p.type].label}
                    </span>
                  </span>
                  {active && <Check width={15} height={15} className="shrink-0 text-brand-accent" />}
                </Link>
              );
            })}
          </div>
          <Link
            href="/app"
            onClick={go}
            role="menuitem"
            className="flex items-center gap-2.5 border-t border-line px-3 py-2.5 text-sm font-medium text-brand-accent transition-colors hover:bg-brand-50"
          >
            <Plus width={16} height={16} />
            Nový projekt
          </Link>
        </div>
      )}
    </div>
  );
}
