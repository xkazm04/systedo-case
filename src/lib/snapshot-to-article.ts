/** Turn a dashboard MetricsSnapshot into a publish-ready, typed Article — the
 *  bridge between the analytics pillar and the content pillar. Deterministic
 *  (no AI, no I/O): the same numbers the dashboard reconciles become a structured
 *  data-story the existing ArticleBody renderer + JSON-LD pipeline publish.
 *
 *  Server-safe but pure — takes a snapshot in, returns an Article out. */
import type { Article, Block, Inline } from "./article";
import { METRICS, type Anomaly, type MetricsSnapshot } from "./metrics";
import type { MetricKey } from "./types";
import { fmtCZK, fmtMultiple, fmtPct, fmtSignedPct } from "./format";

const METRIC_LABEL: Partial<Record<MetricKey, string>> = {
  visits: "návštěvy",
  cost: "náklady",
  conversions: "konverze",
  revenue: "obrat",
  pno: "PNO",
};

/** "14.5." from an ISO date. */
const ddmm = (iso: string): string => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.`;
};

function anomalySentence(a: Anomaly): string {
  const devPct = a.expected > 0 ? (a.observed - a.expected) / a.expected : 0;
  const what = METRIC_LABEL[a.metric] ?? a.metric;
  switch (a.kind) {
    case "spike":
      return `${ddmm(a.date)}: ${what} ${fmtSignedPct(devPct)} nad očekáváním`;
    case "drop":
      return `${ddmm(a.date)}: ${what} ${fmtSignedPct(devPct)} pod očekáváním`;
    case "outage":
      return `${ddmm(a.date)}: výpadek — ${what} u nuly`;
    case "goal-breach":
      return `${ddmm(a.date)}: PNO ${fmtPct(a.observed)} překročilo cíl ${fmtPct(a.expected, 0)}`;
  }
}

export function snapshotToArticle(
  snapshot: MetricsSnapshot,
  client: { name: string; segment: string },
  asOf: string
): Article {
  const c = snapshot.current;
  const goalPno = snapshot.goals.pno;
  const pnoUnderGoal = c.pno <= goalPno;
  const revenueUp = snapshot.delta.revenue >= 0;

  const paid = snapshot.channels.filter((ch) => ch.cost > 0);
  const best = [...paid].sort((a, b) => b.roas - a.roas)[0];
  const worst = [...paid].sort((a, b) => b.pno - a.pno)[0];

  // --- meta -----------------------------------------------------------------
  const title = `Výkonnostní report: ${client.name} za ${snapshot.period.label}`;
  const perex =
    `Datový souhrn marketingového výkonu ${client.name} za ${snapshot.period.label}. ` +
    `Obrat ${fmtCZK(c.revenue)} při nákladech ${fmtCZK(c.cost)}, PNO ${fmtPct(c.pno)} ` +
    `(cíl ${fmtPct(goalPno, 0)}). Automaticky vygenerováno z dashboardu.`;

  // --- KPI stat block -------------------------------------------------------
  const headlineKeys: MetricKey[] = ["visits", "cost", "conversions", "revenue", "pno", "roas"];
  const statItems = headlineKeys.map((k) => ({
    value: METRICS[k].format(c[k]),
    label: METRICS[k].label,
  }));

  // --- wins -----------------------------------------------------------------
  const wins: Inline[][] = [];
  wins.push([
    `Obrat ${revenueUp ? "vzrostl" : "klesl"} o `,
    { text: fmtSignedPct(snapshot.delta.revenue).replace("+", ""), bold: true },
    ` meziobdobně.`,
  ]);
  if (best) {
    wins.push([
      `Nejefektivnější kanál je `,
      { text: best.channel, bold: true },
      ` s ROAS ${fmtMultiple(best.roas)}.`,
    ]);
  }
  wins.push(
    pnoUnderGoal
      ? [`Celkové PNO `, { text: fmtPct(c.pno), bold: true }, ` je pod cílem ${fmtPct(goalPno, 0)}.`]
      : [`Konverzní poměr `, { text: fmtPct(c.cr, 2), bold: true }, ` napříč kanály.`]
  );

  // --- risks ----------------------------------------------------------------
  const risks: Inline[][] = [];
  if (worst) {
    risks.push([
      { text: worst.channel, bold: true },
      ` má nejvyšší PNO ${fmtPct(worst.pno)} — táhne efektivitu dolů.`,
    ]);
  }
  risks.push(
    pnoUnderGoal
      ? [`Náklady `, { text: fmtSignedPct(snapshot.delta.cost), bold: true }, ` meziobdobně — hlídat tempo růstu.`]
      : [`Celkové PNO `, { text: fmtPct(c.pno), bold: true }, ` je nad cílem ${fmtPct(goalPno, 0)}.`]
  );

  // --- actions --------------------------------------------------------------
  const actions: Inline[][] = [];
  if (best) {
    actions.push([
      { text: `Posílit ${best.channel}`, bold: true },
      ` — kanál s nejlepším ROAS (${fmtMultiple(best.roas)}) má prostor pro navýšení rozpočtu.`,
    ]);
  }
  if (worst) {
    actions.push([
      { text: `Optimalizovat ${worst.channel}`, bold: true },
      ` — při PNO ${fmtPct(worst.pno)} zkontrolovat nabídky, vyloučení a kvalitu cílení.`,
    ]);
  }
  actions.push(
    pnoUnderGoal
      ? [{ text: "Škálovat při zachování PNO", bold: true }, ` — prostor zvýšit objem, dokud PNO zůstane pod cílem.`]
      : [{ text: "Srovnat PNO k cíli", bold: true }, ` — přealokovat rozpočet od nákladných kanálů k těm s nejlepší návratností.`]
  );

  // --- blocks ---------------------------------------------------------------
  const blocks: Block[] = [
    { type: "h2", id: "shrnuti", text: "Shrnutí období" },
    {
      type: "p",
      content: [
        `Za posledních ${snapshot.period.label} dosáhl ${client.name} (${client.segment}) obratu `,
        { text: fmtCZK(c.revenue), bold: true },
        ` při nákladech ${fmtCZK(c.cost)}, což odpovídá PNO ${fmtPct(c.pno)} a ROAS ${fmtMultiple(c.roas)}. `,
        `Konverze ${snapshot.delta.conversions >= 0 ? "vzrostly" : "klesly"} o ${fmtSignedPct(
          snapshot.delta.conversions
        ).replace("+", "")} oproti předchozímu stejně dlouhému období.`,
      ],
    },
    { type: "stat", items: statItems },
    {
      type: "callout",
      variant: pnoUnderGoal ? "tip" : "warn",
      title: pnoUnderGoal ? "PNO je pod cílem" : "PNO překračuje cíl",
      content: [
        pnoUnderGoal
          ? `Portfolio plní dohodnutý cíl efektivity (${fmtPct(goalPno, 0)}). Hlavní páka je teď škálování objemu.`
          : `Portfolio překračuje cílové PNO (${fmtPct(goalPno, 0)}). Priorita je srovnat efektivitu, ne objem.`,
      ],
    },
    { type: "h2", id: "co-se-dari", text: "Co se daří" },
    { type: "ul", items: wins },
    { type: "h2", id: "rizika", text: "Na co si dát pozor" },
    { type: "ul", items: risks },
  ];

  // Optional anomalies section, only when the detector flagged something.
  if (snapshot.anomalies.length > 0) {
    const top = [...snapshot.anomalies].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 5);
    blocks.push(
      { type: "h2", id: "udalosti", text: "Významné události v období" },
      { type: "ul", items: top.map((a) => [anomalySentence(a)] as Inline[]) }
    );
  }

  blocks.push(
    { type: "h2", id: "kroky", text: "Doporučené kroky" },
    { type: "ol", items: actions },
    {
      type: "cta",
      text: "Prozkoumejte čísla interaktivně — s přepínáním období, trendem a rozpadem podle kanálů.",
      href: "/dashboard",
      kind: "internal",
      cta: "Otevřít dashboard",
    }
  );

  // --- FAQ ------------------------------------------------------------------
  const faq = [
    {
      q: "Z jakých dat report vychází?",
      a: [
        `Z reálné časové řady výkonu ${client.name} za ${snapshot.period.label}, ze stejného zdroje jako interaktivní dashboard — čísla se proto vždy shodují.`,
      ] as Inline[],
    },
    {
      q: "Plní portfolio cílové PNO?",
      a: [
        pnoUnderGoal
          ? `Ano — PNO ${fmtPct(c.pno)} je pod dohodnutým cílem ${fmtPct(goalPno, 0)}.`
          : `Ne — PNO ${fmtPct(c.pno)} je nad cílem ${fmtPct(goalPno, 0)}; report navrhuje kroky k jeho srovnání.`,
      ] as Inline[],
    },
    {
      q: "Který kanál je nejefektivnější?",
      a: [
        best
          ? `${best.channel} s ROAS ${fmtMultiple(best.roas)} (PNO ${fmtPct(best.pno)}).`
          : "V tomto období nejsou dostupná data o placených kanálech.",
      ] as Inline[],
    },
  ];

  return {
    meta: {
      title,
      perex,
      author: "Systedo · marketingová analytika",
      role: "Automaticky generovaný report",
      dateISO: asOf,
      readingMinutes: 2,
      category: "Výkonnostní report",
      tags: ["report", "výkonnostní marketing", client.segment, snapshot.period.label],
    },
    blocks,
    faq,
  };
}
