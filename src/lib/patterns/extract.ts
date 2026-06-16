/** Deterministic winning-pattern extraction — mines the tenant's own synced
 *  campaigns + AI-score history for reusable lessons (what works, what to avoid,
 *  what optimization moved the needle). No AI, no invention: every pattern is a
 *  rendering of real numbers, so it reconciles with the rest of the app.
 *  Server-only (reads the campaign store). */
import { createHash } from "node:crypto";
import {
  CAMPAIGN_TYPE_LABELS,
  TARGET_PNO,
  TARGET_ROAS,
  aggregate,
  groupByType,
  withMetrics,
} from "@/lib/campaigns/types";
import { getReportHistories, listCampaigns } from "@/lib/campaigns/store";
import { fmtCZK, fmtMultiple, fmtPct } from "@/lib/format";
import type { Pattern, PatternCategory } from "./types";

/** Stable id from the title so the same derived pattern doesn't duplicate across
 *  reloads (and so a saved copy can be matched back to its auto source). */
function patternId(title: string): string {
  return createHash("sha1").update(title).digest("hex").slice(0, 16);
}

function mk(
  title: string,
  category: PatternCategory,
  insight: string,
  evidence: string
): Pattern {
  return { id: patternId(title), title, category, insight, evidence, source: "auto", createdAt: "" };
}

/** Derive patterns from the current campaign set + score history. Deterministic. */
export async function extractPatterns(tenant: string): Promise<Pattern[]> {
  const campaigns = await listCampaigns(tenant);
  if (campaigns.length === 0) return [];

  const rows = campaigns.map(withMetrics);
  const portfolio = aggregate(campaigns);
  const types = groupByType(campaigns);
  const out: Pattern[] = [];

  // 1. Best-performing channel type (a structural lesson worth repeating).
  const bestType = [...types].filter((t) => t.total.cost > 0).sort((a, b) => b.total.roas - a.total.roas)[0];
  if (bestType && bestType.total.roas >= TARGET_ROAS) {
    out.push(
      mk(
        `${CAMPAIGN_TYPE_LABELS[bestType.type]} je nejefektivnější typ`,
        "structure",
        `${CAMPAIGN_TYPE_LABELS[bestType.type]} drží nejlepší návratnost — upřednostňujte ho při alokaci rozpočtu.`,
        `ROAS ${fmtMultiple(bestType.total.roas)} při nákladech ${fmtCZK(bestType.total.cost)} (${bestType.total.count} kampaní).`
      )
    );
  }

  // 2. Top campaign over target — a template for scaling.
  const winners = rows.filter((c) => c.cost > 0 && c.roas >= TARGET_ROAS).sort((a, b) => b.roas - a.roas);
  if (winners[0]) {
    const w = winners[0];
    out.push(
      mk(
        `Vzor pro škálování: „${w.name}"`,
        "budget",
        `Kampaně tohoto střihu (${CAMPAIGN_TYPE_LABELS[w.type]}) nad cílovým ROAS unesou vyšší rozpočet bez ztráty efektivity.`,
        `ROAS ${fmtMultiple(w.roas)}, PNO ${fmtPct(w.pno)} (cíl ${fmtPct(TARGET_PNO, 0)}).`
      )
    );
  }

  // 3. Money pit to avoid — what NOT to repeat.
  const losers = rows
    .filter((c) => c.status === "enabled" && c.cost > 0 && c.roas > 0 && c.roas < TARGET_ROAS)
    .map((c) => ({ c, waste: c.cost * (1 - c.roas / TARGET_ROAS) }))
    .sort((a, b) => b.waste - a.waste);
  if (losers[0]) {
    const l = losers[0].c;
    out.push(
      mk(
        `Past na rozpočet: profil „${l.name}"`,
        "budget",
        `Kampaně s tímto profilem pálí rozpočet pod cílem — hlídejte je a včas utlumte nebo přestavte.`,
        `ROAS ${fmtMultiple(l.roas)} pod cílem ${fmtMultiple(TARGET_ROAS)}; promrhaný odhad ${fmtCZK(Math.round(losers[0].waste))}.`
      )
    );
  }

  // 4. Brand search efficiency (a recurring high-ROAS structural win).
  const brandish = rows
    .filter((c) => c.type === "search" && /brand|značk/i.test(c.name) && c.roas > 0)
    .sort((a, b) => b.roas - a.roas)[0];
  if (brandish) {
    out.push(
      mk(
        "Brandové vyhledávání jako efektivní základ",
        "structure",
        "Samostatná brandová Search kampaň zachytává nejlevnější poptávku — držte ji oddělenou od generického Search.",
        `„${brandish.name}" má ROAS ${fmtMultiple(brandish.roas)} při PNO ${fmtPct(brandish.pno)}.`
      )
    );
  }

  // 5. Optimization that moved the needle (from score history).
  const histories = await getReportHistories(tenant);
  for (const [key, points] of Object.entries(histories)) {
    if (points.length < 2) continue;
    const first = points[0]!.score;
    const last = points[points.length - 1]!.score;
    if (last - first >= 10) {
      const label = key === "overall" ? "portfolia" : "kampaně";
      out.push(
        mk(
          `Optimalizace ${label} zabrala`,
          "trend",
          "Opakované AI vyhodnocení + zásahy zvedly skóre zdraví — pravidelná kontrola se vyplácí.",
          `Skóre ${first} → ${last} napříč ${points.length} vyhodnoceními.`
        )
      );
      break; // one trend pattern is enough
    }
  }

  // 6. Portfolio hitting target — a baseline worth protecting.
  if (portfolio.pno > 0 && portfolio.pno <= TARGET_PNO) {
    out.push(
      mk(
        "Portfolio plní cílové PNO",
        "trend",
        "Mix kampaní drží dohodnutou efektivitu — hlavní páka je teď objem, ne škrty.",
        `Celkové PNO ${fmtPct(portfolio.pno)} ≤ cíl ${fmtPct(TARGET_PNO, 0)}, ROAS ${fmtMultiple(portfolio.roas)}.`
      )
    );
  }

  return out;
}
