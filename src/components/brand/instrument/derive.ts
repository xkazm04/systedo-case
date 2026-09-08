/** THE PAYLOAD — everything the instrument shows, for all five project types,
 *  computed ONCE on the server and handed to the client board as plain data.
 *
 *  P12: the redesign wins when the product is clearer, and the product's
 *  clearest property is that it re-composes by project type. So the page does
 *  the same, and to do it without a round trip every type's view is derived up
 *  front — from the same registry, the same seeded plans and the same demo
 *  fixtures the app itself reads. Nothing here is typed by hand, nothing here
 *  touches a store, and the client receives strings and numbers only (P7's
 *  person is a Czech operator on a phone; the payload is ~6 KB). */
import { KPI_PRESETS, MODULES, modulesFor, kpiLabel, type ModuleSection } from "@/lib/projects/modules";
import { PROJECT_TYPES, projectTypeMeta, type ProjectType } from "@/lib/projects/types";
import { demoProjectFor } from "@/lib/demo/projects";
import { channelPlanForProject } from "@/lib/organic-channels/sample";
import { buildSnapshot } from "@/lib/snapshot";
import { performance } from "@/lib/data";
import { fmtCZKCompact, fmtInt, fmtMultiple, fmtPct, type SupportedLocale } from "@/lib/format";
import { EFFORT_LABELS } from "@/components/app/channels/labels";

export interface TypeView {
  type: ProjectType;
  label: string;
  goal: string;
  lead: string;
  focus: string;
  kpis: { label: string; value: string }[];
  /** the series the hero draws for this type: revenue for selling types, conversions otherwise */
  series: number[];
  seriesLabel: string;
  /** module keys this type gets — the switchboard lights these */
  lit: string[];
  plan: { name: string; fit: number; effort: string }[];
}

export interface InstrumentPayload {
  types: ProjectType[];
  views: Record<ProjectType, TypeView>;
  board: { section: ModuleSection; keys: { key: string; label: string }[] }[];
  total: number;
}

const PLUMBING: ModuleSection[] = ["settings", "system"];
const DAYS = 90;
const PLAN_ROWS = 8;
const SELLS: ProjectType[] = ["eshop", "content"];

function formatKpi(format: string, v: number): string {
  if (format === "czk") return fmtCZKCompact(v);
  if (format === "multiple") return fmtMultiple(v);
  if (format === "pct") return fmtPct(v);
  return fmtInt(v);
}

export function deriveInstrument(locale: SupportedLocale): InstrumentPayload {
  const snap = buildSnapshot("90d");
  const totals = snap.current as unknown as Record<string, number>;
  const daily = performance.daily.slice(-DAYS);
  const sections = (["main", "growth", "studio", "comms", "insights"] as ModuleSection[]).filter((s) => !PLUMBING.includes(s));

  const views = Object.fromEntries(
    PROJECT_TYPES.map((type) => {
      const meta = projectTypeMeta(type, locale);
      const project = demoProjectFor(type);
      const sells = SELLS.includes(type);
      const view: TypeView = {
        type,
        label: meta.label,
        goal: meta.primaryGoal ?? "",
        lead: meta.overviewLead ?? "",
        focus: meta.channelFocus ?? "",
        kpis: KPI_PRESETS[type].map((k) => ({ label: kpiLabel(k, locale), value: formatKpi(k.format, totals[k.metric] ?? 0) })),
        series: daily.map((d) => (sells ? d.revenue : d.conversions)),
        seriesLabel: sells ? (locale === "en" ? "revenue, 90 days" : "obrat, 90 dní") : locale === "en" ? "conversions, 90 days" : "konverze, 90 dní",
        lit: modulesFor(type).map((m) => m.key),
        plan: [...channelPlanForProject(project)]
          .sort((a, b) => b.fit - a.fit)
          .slice(0, PLAN_ROWS)
          .map((c) => ({ name: c.name, fit: c.fit, effort: EFFORT_LABELS[c.effort][locale] ?? EFFORT_LABELS[c.effort].en ?? c.effort })),
      };
      return [type, view];
    })
  ) as Record<ProjectType, TypeView>;

  return {
    types: PROJECT_TYPES,
    views,
    board: sections.map((section) => ({
      section,
      keys: MODULES.filter((m) => m.section === section).map((m) => ({ key: m.key, label: locale === "en" ? m.labelEn : m.label })),
    })),
    total: MODULES.filter((m) => !PLUMBING.includes(m.section)).length,
  };
}
