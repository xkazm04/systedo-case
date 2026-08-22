/** Seeded sample contacts — the illustrative set a project shows before a single
 *  real lead exists. Follows `lead-quality/sample.ts` conventions: per-project-type
 *  seeds, deterministic, and clearly labelled sample by the resolver so the module
 *  shell renders its honesty note (`ModulePage sample={!resolved.live}`).
 *
 *  Deliberately small. A sample's job is to make an empty module legible, not to
 *  simulate a busy CRM — an operator who cannot tell sample from real has been
 *  lied to. Every sample contact is stamped `attribution.connectorId = "sample"`
 *  so it can never be mistaken for connector output. PURE (`now` is passed in). */
import type { Project, ProjectType } from "@/lib/projects/types";
import type { Contact, PipelineStage } from "./types";
import { contactKeys } from "./normalize";

interface Seed {
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  stage: PipelineStage;
  source: string;
  campaign?: string;
  /** how long ago the enquiry arrived */
  hoursAgo: number;
  notes?: string;
  tags?: string[];
}

const LEADGEN_SEEDS: Seed[] = [
  { name: "Jan Novák", email: "jan.novak@stavbyprofi.cz", phone: "+420 777 123 456", companyName: "Stavby Profi s.r.o.", stage: "new", source: "google-ads", campaign: "Brand + generické", hoursAgo: 1, notes: "Poptávka na rekonstrukci střechy, 180 m². Termín do konce kvartálu.", tags: ["střecha"] },
  { name: "Petra Dvořáková", email: "p.dvorakova@gmail.com", phone: "+420 606 221 004", stage: "working", source: "sklik", hoursAgo: 6, notes: "Zajímá ji zateplení fasády, ptá se na dotační program." },
  { name: "Tomáš Beneš", email: "benes@montaze-plzen.cz", companyName: "Montáže Plzeň", stage: "qualified", source: "referral", hoursAgo: 52, notes: "Rozpočet potvrzen, čeká na termín." },
  { name: "Lucie Horáková", phone: "+420 731 909 118", stage: "opportunity", source: "organic", hoursAgo: 190, notes: "Nabídka odeslána, jedná se o ceně." },
  { name: "Marek Šimek", email: "simek@dvorak-reality.cz", companyName: "Dvořák Reality", stage: "won", source: "google-ads", campaign: "Brand + generické", hoursAgo: 720, notes: "Zakázka podepsána." },
  { name: "Anonymní poptávka", email: "info@spam-example.com", stage: "disqualified", source: "meta-lead-form", hoursAgo: 300, notes: "Nesouvisející nabídka služeb." },
];

const LOCAL_SEEDS: Seed[] = [
  { name: "Eva Marková", phone: "+420 602 118 447", stage: "new", source: "organic", hoursAgo: 0.5, notes: "Objednání na dentální hygienu, nejraději odpoledne." },
  { name: "Jiří Král", email: "jiri.kral@seznam.cz", stage: "working", source: "direct", hoursAgo: 4, notes: "Ptá se na ceník bělení." },
  { name: "Hana Veselá", phone: "+420 774 330 210", stage: "qualified", source: "referral", hoursAgo: 30, notes: "Doporučena stávající pacientkou." },
  { name: "Ondřej Bílek", email: "o.bilek@gmail.com", stage: "won", source: "organic", hoursAgo: 400, notes: "Termín potvrzen." },
];

const GENERIC_SEEDS: Seed[] = [
  { name: "Klára Pospíšilová", email: "klara@studio-atrium.cz", companyName: "Studio Atrium", stage: "new", source: "organic", hoursAgo: 2, notes: "Poptávka na spolupráci." },
  { name: "David Urban", email: "d.urban@gmail.com", stage: "working", source: "direct", hoursAgo: 20, notes: "Zajímá se o ceník." },
  { name: "Nikola Bartošová", phone: "+420 720 554 190", stage: "qualified", source: "referral", hoursAgo: 96, notes: "Doporučení od partnera." },
];

function seedsFor(type: ProjectType): Seed[] {
  switch (type) {
    case "leadgen":
      return LEADGEN_SEEDS;
    case "local":
      return LOCAL_SEEDS;
    default:
      return GENERIC_SEEDS;
  }
}

const HOUR_MS = 3_600_000;

/** The illustrative contact set for a project. Ids are DETERMINISTIC and prefixed
 *  `sample-` so nothing downstream can confuse one with a stored record, and no
 *  sample contact is ever written to the store. */
export function sampleContactsForProject(project: Project, now: Date = new Date()): Contact[] {
  return seedsFor(project.type).map((s, i) => {
    const at = new Date(now.getTime() - s.hoursAgo * HOUR_MS).toISOString();
    const keys = contactKeys({ name: s.name, email: s.email, phone: s.phone });
    return {
      id: `sample-${project.id}-${i}`,
      projectId: project.id,
      name: s.name,
      ...(s.email ? { email: s.email } : {}),
      ...(s.phone ? { phone: s.phone } : {}),
      ...(s.companyName ? { companyName: s.companyName } : {}),
      ...keys,
      stage: s.stage,
      stageEnteredAt: at,
      attribution: {
        source: s.source,
        ...(s.campaign ? { campaign: s.campaign } : {}),
        connectorId: "sample",
      },
      consent: [],
      tags: s.tags ?? [],
      ...(s.notes ? { notes: s.notes } : {}),
      firstSeenAt: at,
      lastActivityAt: at,
      createdAt: at,
      updatedAt: at,
    } satisfies Contact;
  });
}
