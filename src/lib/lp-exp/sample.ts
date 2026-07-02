/** Illustrative landing-page experiments for an app/SaaS project. Each experiment
 *  is a keyword cluster with a control + challenger variants and their traffic /
 *  signups. Real-integration seam: real traffic split + analytics. */
import type { Project } from "@/lib/projects/types";
import { projectVary } from "@/lib/project-data/vary";

export interface Variant {
  label: string;
  visitors: number;
  signups: number;
  /** optional live URL of this variant's landing page (display-only seam) */
  url?: string;
}

export interface LpExperiment {
  id: string;
  /** the keyword cluster the landing page targets */
  cluster: string;
  status: "running" | "done";
  /** first variant is the control */
  variants: Variant[];
}

export const SAMPLE_EXPERIMENTS: LpExperiment[] = [
  {
    id: "exp-pm",
    cluster: "projektové řízení nástroj",
    status: "done",
    variants: [
      { label: "A · Kontrola", visitors: 4200, signups: 176 },
      { label: "B · Důraz na šablony", visitors: 4180, signups: 231, url: "/lp/projektove-rizeni-sablony" },
    ],
  },
  {
    id: "exp-crm",
    cluster: "CRM zdarma",
    status: "done",
    variants: [
      { label: "A · Kontrola", visitors: 3600, signups: 144 },
      { label: "B · Sociální důkaz", visitors: 3550, signups: 132 },
      { label: "C · Kratší formulář", visitors: 3580, signups: 176 },
    ],
  },
  {
    id: "exp-faktury",
    cluster: "fakturace pro OSVČ",
    status: "running",
    variants: [
      { label: "A · Kontrola", visitors: 2100, signups: 63 },
      { label: "B · Cena nahoře", visitors: 2050, signups: 74 },
    ],
  },
  {
    id: "exp-alt",
    cluster: "alternativa k Asaně",
    status: "running",
    variants: [
      { label: "A · Kontrola", visitors: 1500, signups: 60 },
      { label: "B · Srovnávací tabulka", visitors: 1480, signups: 69 },
    ],
  },
];

/** Per-project experiments: each variant's visitors + signups scaled by one
 *  uniform per-project factor, so projects show different traffic while every
 *  variant's conversion rate — and therefore which challenger wins — is unchanged. */
export function experimentsForProject(project: Project): LpExperiment[] {
  const v = projectVary(project, "lp-exp");
  return SAMPLE_EXPERIMENTS.map((e) => ({
    ...e,
    variants: e.variants.map((va) => ({ ...va, visitors: v.int(va.visitors), signups: v.int(va.signups) })),
  }));
}
