/** Deterministic winning-pattern extraction — mines the tenant's own synced
 *  campaigns + AI-score history for reusable lessons (what works, what to avoid,
 *  what optimization moved the needle). No AI, no invention: every pattern is a
 *  rendering of real numbers, so it reconciles with the rest of the app.
 *  Server-only (reads the campaign store). */
import { createHash } from "node:crypto";
import {
  CAMPAIGN_TYPE_LABELS,
  aggregate,
  groupByType,
  withMetrics,
  type Campaign,
} from "@/lib/campaigns/types";
import { getReportHistories, listCampaigns } from "@/lib/campaigns/store";
import { PAID_PORTFOLIO_TARGET_PNO } from "@/lib/targets";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct, fmtSignedPct } from "@/lib/format";
import { evaluate } from "@/lib/lp-exp/compute";
import { SAMPLE_EXPERIMENTS, type LpExperiment } from "@/lib/lp-exp/sample";
import { SAMPLE_ATTRIBUTION, type ChannelPerf } from "@/lib/distribution/sample";
import type { ReportHistoryPoint } from "@/lib/ai-types";
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

/** Pure pattern mining over an already-loaded campaign set + score history —
 *  no I/O, so it is directly unit-testable. `extractPatterns` is the thin store
 *  wrapper below.
 *
 *  `pnoGoal` is the tenant's agreed PNO target (ClientProfile.pnoGoal) — the SAME
 *  bar the reports, alerts and triage measure against, threaded in so mined
 *  patterns can't judge a tenant against a different target than the rest of the
 *  app. Defaults to the paid-portfolio target (0.18) so an unseeded/default tenant
 *  mines byte-identically to before. The target ROAS is its reciprocal. */
export function minePatterns(
  campaigns: Campaign[],
  histories: Record<string, ReportHistoryPoint[]>,
  pnoGoal: number = PAID_PORTFOLIO_TARGET_PNO
): Pattern[] {
  if (campaigns.length === 0) return [];

  const targetPno = pnoGoal;
  const targetRoas = 1 / pnoGoal;
  const rows = campaigns.map(withMetrics);
  const portfolio = aggregate(campaigns);
  const types = groupByType(campaigns);
  const out: Pattern[] = [];

  // 1. Best-performing channel type (a structural lesson worth repeating).
  const bestType = [...types].filter((t) => t.total.cost > 0).sort((a, b) => b.total.roas - a.total.roas)[0];
  if (bestType && bestType.total.roas >= targetRoas) {
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
  const winners = rows.filter((c) => c.cost > 0 && c.roas >= targetRoas).sort((a, b) => b.roas - a.roas);
  if (winners[0]) {
    const w = winners[0];
    out.push(
      mk(
        `Vzor pro škálování: „${w.name}"`,
        "budget",
        `Kampaně tohoto střihu (${CAMPAIGN_TYPE_LABELS[w.type]}) nad cílovým ROAS unesou vyšší rozpočet bez ztráty efektivity.`,
        `ROAS ${fmtMultiple(w.roas)}, PNO ${fmtPct(w.pno)} (cíl ${fmtPct(targetPno, 0)}).`
      )
    );
  }

  // 3. Money pit to avoid — what NOT to repeat.
  const losers = rows
    .filter((c) => c.status === "enabled" && c.cost > 0 && c.roas > 0 && c.roas < targetRoas)
    .map((c) => ({ c, waste: c.cost * (1 - c.roas / targetRoas) }))
    .sort((a, b) => b.waste - a.waste);
  if (losers[0]) {
    const l = losers[0].c;
    out.push(
      mk(
        `Past na rozpočet: profil „${l.name}"`,
        "budget",
        `Kampaně s tímto profilem pálí rozpočet pod cílem — hlídejte je a včas utlumte nebo přestavte.`,
        `ROAS ${fmtMultiple(l.roas)} pod cílem ${fmtMultiple(targetRoas)}; promrhaný odhad ${fmtCZK(Math.round(losers[0].waste))}.`
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
  if (portfolio.pno > 0 && portfolio.pno <= targetPno) {
    out.push(
      mk(
        "Portfolio plní cílové PNO",
        "trend",
        "Mix kampaní drží dohodnutou efektivitu — hlavní páka je teď objem, ne škrty.",
        `Celkové PNO ${fmtPct(portfolio.pno)} ≤ cíl ${fmtPct(targetPno, 0)}, ROAS ${fmtMultiple(portfolio.roas)}.`
      )
    );
  }

  return out;
}

/** The tested angle behind a variant label like "B · Důraz na šablony" → "Důraz na
 *  šablony" (the part after the "·" prefix). Falls back to the whole label when
 *  there is no prefix, so a bare hypothesis label still reads sensibly. */
function variantAngle(label: string): string {
  const parts = label.split("·");
  return (parts.length > 1 ? parts.slice(1).join("·") : label).trim();
}

/** Pure `creative`-category miner: a WON landing-page experiment variant becomes a
 *  reusable creative angle. Reads the LP-experiment module's OWN verdict (`evaluate`
 *  from @/lib/lp-exp) so only a statistically significant winner over control is
 *  mined — a leading-but-unproven arm is not a lesson yet. The control→winner CVR
 *  jump and the tested hypothesis are rendered from the stored outcome, so the
 *  pattern reconciles with the experiments module. No I/O → directly unit-testable.
 *  Empty input (or no proven winner) → no patterns. */
export function mineCreativePatterns(experiments: LpExperiment[]): Pattern[] {
  const out: Pattern[] = [];
  for (const exp of experiments) {
    const r = evaluate(exp);
    if (!r.significant || !r.winner) continue;
    const control = r.variants.find((v) => v.isControl);
    if (!control) continue;
    const angle = variantAngle(r.winner.label);
    out.push(
      mk(
        `Vítězný úhel: „${angle}" (${r.cluster})`,
        "creative",
        `Hypotéza „${angle}" zvedla konverzi z ${fmtPct(control.cvr)} na ${fmtPct(r.winner.cvr)} — použijte tento úhel i v dalších kreativách a inzerátech.`,
        `Klastr „${r.cluster}": ${fmtSignedPct(r.winner.uplift)} vs. kontrola, ${fmtPct(r.confidence)} jistota (${fmtInt(r.winner.visitors)} návštěvníků).`
      )
    );
  }
  return out;
}

/** Pure `targeting`-category miner: per-channel CTR outliers from the distribution
 *  learnings become targeting lessons — a channel that clearly beats (or trails)
 *  the mean CTR of its peers is where budget/cílení should shift. Needs ≥3 channels
 *  with reach so "peers" is meaningful; emits at most one over- and one
 *  under-performer, and only when the gap clears the outlier threshold. No I/O →
 *  directly unit-testable. Fewer than 3 channels, or no clear outlier → no patterns. */
export function mineTargetingPatterns(channels: ChannelPerf[]): Pattern[] {
  const rows = channels
    .filter((c) => c.reach > 0)
    .map((c) => ({ channel: c.channel, ctr: c.clicks / c.reach }));
  if (rows.length < 3) return [];

  // Peer mean = the mean CTR of the OTHER channels (excludes the candidate itself),
  // so an outlier is judged against its peers, not against a benchmark it skews.
  const peerMean = (idx: number) => {
    const others = rows.filter((_, i) => i !== idx);
    return others.reduce((a, r) => a + r.ctr, 0) / others.length;
  };
  const withPeer = rows.map((r, i) => ({ ...r, peer: peerMean(i) }));
  const OUTLIER = 0.25; // ≥25 % above / below the peer mean CTR to count as an outlier

  const out: Pattern[] = [];
  const over = [...withPeer]
    .filter((r) => r.peer > 0)
    .sort((a, b) => b.ctr / b.peer - a.ctr / a.peer)[0];
  if (over && over.ctr >= over.peer * (1 + OUTLIER)) {
    out.push(
      mk(
        `Nadvýkonný kanál: ${over.channel}`,
        "targeting",
        `${over.channel} má výrazně vyšší CTR než ostatní kanály — přesuňte sem víc rozpočtu i cílení a stavte na něm jako na primárním kanálu.`,
        `CTR ${fmtPct(over.ctr)} vs. ${fmtPct(over.peer)} průměr ostatních kanálů (${fmtMultiple(over.ctr / over.peer)}).`
      )
    );
  }
  const under = [...withPeer]
    .filter((r) => r.peer > 0 && r.channel !== over?.channel)
    .sort((a, b) => a.ctr / a.peer - b.ctr / b.peer)[0];
  if (under && under.ctr <= under.peer * (1 - OUTLIER)) {
    out.push(
      mk(
        `Podvýkonný kanál: ${under.channel}`,
        "targeting",
        `${under.channel} zaostává za ostatními kanály v CTR — přehodnoťte cílení a kreativu, nebo rozpočet přesuňte na silnější kanály.`,
        `CTR ${fmtPct(under.ctr)} vs. ${fmtPct(under.peer)} průměr ostatních kanálů.`
      )
    );
  }
  return out;
}

/** The creative/targeting lessons mined from the LP-experiment + distribution
 *  modules' resolved data. Both source stores are SAMPLE-ONLY (never persisted —
 *  each module renders per-project-scaled sample data whose CVR/CTR *rates* are
 *  project-invariant), so these lessons are demo-derived, not account-derived.
 *  That is why they are a separate producer from `minePatterns` (which mines the
 *  tenant's own synced campaigns): the library shows them as illustrative lessons
 *  for every tenant, but the AI-prompt path must NOT present them as proven wins
 *  from a live account — see `promptSafePatterns`. The "(ukázková lekce)" suffix
 *  keeps the rendered insight honest wherever it appears. */
export function sampleLessonPatterns(): Pattern[] {
  const mark = (p: Pattern): Pattern => ({ ...p, insight: `${p.insight} (ukázková lekce)` });
  return [
    ...mineCreativePatterns(SAMPLE_EXPERIMENTS),
    ...mineTargetingPatterns(SAMPLE_ATTRIBUTION),
  ].map(mark);
}

/** Truth-in-labeling gate for the AI-prompt path (`getPatternLines`): a LIVE
 *  tenant's prompts must contain only lessons mined from their real data plus
 *  their own manual saves — never the demo-derived sample lessons above (those
 *  would be fabricated evidence "from this account"). A sample/demo tenant keeps
 *  them: there the whole surface is illustrative. Matching is by the stable id
 *  (sha1 of title), so a manually SAVED copy of a sample lesson gets a random
 *  store id and is deliberately kept — the user chose to endorse it. Pure. */
export function promptSafePatterns(patterns: Pattern[], liveTenant: boolean): Pattern[] {
  if (!liveTenant) return patterns;
  const sampleIds = new Set(sampleLessonPatterns().map((p) => p.id));
  return patterns.filter((p) => !sampleIds.has(p.id));
}

/** Derive patterns from the tenant's current campaign set + score history.
 *  Loads both from the store, then delegates to the pure `minePatterns`. See it
 *  for the `pnoGoal` contract (defaults to the paid-portfolio 0.18). Campaign-
 *  derived ONLY — the sample-derived creative/targeting lessons are composed in by
 *  `getLibrary` via `sampleLessonPatterns` so the prompt path can tell the two
 *  producers apart. Server-only. */
export async function extractPatterns(
  tenant: string,
  pnoGoal: number = PAID_PORTFOLIO_TARGET_PNO
): Promise<Pattern[]> {
  const campaigns = await listCampaigns(tenant);
  if (campaigns.length === 0) return [];
  const histories = await getReportHistories(tenant);
  return minePatterns(campaigns, histories, pnoGoal);
}
