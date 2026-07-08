/** C1 — auto-derive an on-brand grounding block from the project's Offering spine,
 *  so content/social tools know WHAT the brand sells and HOW it talks BY DEFAULT,
 *  instead of starting from a blank brand-voice field (Sofie: "nikde nevidím, že by
 *  nástroj věděl, co prodávám"). Pure — the caller loads the offerings (sync seeds
 *  via resolve.ts or stored via load.ts). Empty catalogue → "" (name-only is noise).
 */
import type { Project } from "@/lib/projects/types";
import type { Offering } from "@/lib/catalog/offering";
import { isPlan } from "@/lib/catalog/offering";
import type { SupportedLocale } from "@/lib/format";

const NATURE_CS: Record<string, string> = {
  online: "online",
  local: "naživo / s provozovnou",
  hybrid: "online i naživo",
};
const NATURE_EN: Record<string, string> = {
  online: "online",
  local: "in person / at a location",
  hybrid: "online and in person",
};

/** Most-frequent-first, de-duplicated. */
function topBy<T>(items: T[], key: (t: T) => string, n: number): string[] {
  const count = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k) count.set(k, (count.get(k) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

/** Build the brand grounding line-block. Facts only — the model still writes in the
 *  requested locale and to the user-chosen tone; this just stops it inventing a
 *  sortiment. Returns "" when there's nothing real to say. */
export function deriveBrandContext(
  project: Project,
  offerings: Offering[],
  locale: SupportedLocale = "cs"
): string {
  const active = offerings.filter((o) => o.active);
  if (active.length === 0) return "";
  const cs = locale !== "en";

  const cats = topBy(active, (o) => o.category, 4);

  const prices = active.map((o) => o.price).filter((p) => p > 0).sort((a, b) => a - b);
  const currency = active.find((o) => o.currency)?.currency || "Kč";
  const band = prices.length ? `${prices[0]}–${prices[prices.length - 1]} ${currency}` : "";

  const pointItems: string[] = [];
  for (const o of active) {
    pointItems.push(...(o.tags ?? []));
    if (isPlan(o)) pointItems.push(...(o.differentiators ?? []));
  }
  const points = topBy(pointItems.map((p) => ({ p })), (x) => x.p, 4);

  const channels = topBy(
    active.flatMap((o) => (o.channels ?? []).map((c) => ({ c }))),
    (x) => x.c,
    4
  );

  const nature = active[0]?.nature ?? "online";

  const parts: string[] = [];
  if (cs) {
    parts.push(`Značka: ${project.name}.`);
    parts.push(`Sortiment: ${cats.join(", ")} (${active.length} položek${band ? `, ${band}` : ""}).`);
    parts.push(`Prodává ${NATURE_CS[nature] ?? "online"}.`);
    if (points.length) parts.push(`Čím se liší: ${points.join(", ")}.`);
    if (channels.length) parts.push(`Kanály: ${channels.join(", ")}.`);
    parts.push("Drž se tohoto sortimentu a slovníku značky — nevymýšlej jiný sortiment.");
  } else {
    parts.push(`Brand: ${project.name}.`);
    parts.push(`Sells: ${cats.join(", ")} (${active.length} items${band ? `, ${band}` : ""}).`);
    parts.push(`Sold ${NATURE_EN[nature] ?? "online"}.`);
    if (points.length) parts.push(`Differentiators: ${points.join(", ")}.`);
    if (channels.length) parts.push(`Channels: ${channels.join(", ")}.`);
    parts.push("Stay within this catalogue and the brand's vocabulary — don't invent other products.");
  }
  return parts.join(" ");
}
