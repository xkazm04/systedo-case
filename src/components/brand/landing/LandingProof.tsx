/** Homepage proof band — the four KPIs the dashboard renders for the fictional
 *  demo client, labelled as demo data. Extracted verbatim from BrandLanding
 *  (AGENTS.md 200-LOC rubric); no behaviour change. */
import { Container } from "@/components/ui";
import { buildSnapshot } from "@/lib/snapshot";
import { fmtMultiple, fmtPct, fmtSignedPct, fmtCZKCompact } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    proofRoas: "ROAS portfolia",
    proofPno: "PNO · cíl {goal}",
    proofRevenue: "obrat připsaný marketingu",
    proofRevenueDelta: "obrat vs. předchozí období",
    proofLabel: "Důkaz",
    proofHeadline: "Na ukázkovém účtu, posledních 90 dní",
    proofDemoBadge: "Ukázková data: fiktivní klient",
    proofNote:
      "Stejná čísla, jaká dashboard vykresluje pro {client} ({domain}), fiktivního ukázkového klienta. Nejde o výsledky reálného zákazníka.",
  },
  en: {
    proofRoas: "Portfolio ROAS",
    proofPno: "PNO · target {goal}",
    proofRevenue: "revenue attributed to marketing",
    proofRevenueDelta: "revenue vs. prior period",
    proofLabel: "Proof",
    proofHeadline: "On the demo account, last 90 days",
    proofDemoBadge: "Demo data: fictional client",
    proofNote:
      "The same numbers the dashboard renders for {client} ({domain}), a fictional demo client. Not real customer results.",
  },
} as const;

export default async function LandingProof() {
  const t = await getT(T);

  // Quantified demo-account results — the exact numbers the dashboard renders
  // (illustrative data, fictional client), so the homepage shows outcomes, not
  // just claims. Honest framing: labeled demo data, not a customer testimonial
  // (there are no real customers to quote).
  const snap = buildSnapshot("90d");
  const proof = [
    { value: fmtMultiple(snap.current.roas), label: t("proofRoas") },
    { value: fmtPct(snap.current.pno), label: t("proofPno", { goal: fmtPct(snap.goalPno, 0) }) },
    { value: fmtCZKCompact(snap.current.revenue), label: t("proofRevenue") },
    { value: fmtSignedPct(snap.delta.revenue), label: t("proofRevenueDelta") },
  ];

  return (
    <section className="border-y border-line bg-brand-50/40">
      <Container className="py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-accent">
                {t("proofLabel")}
              </p>
              {/* Unmissable demo-data label: the numbers below belong to a
                  fictional client, and that must never read as fine print. */}
              <span className="inline-flex items-center rounded-pill border border-navy-300 bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-navy-700">
                {t("proofDemoBadge")}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
              {t("proofHeadline")}
            </h2>
          </div>
          <p className="max-w-md text-sm text-muted">
            {t("proofNote", { client: snap.client.name, domain: snap.client.domain })}
          </p>
        </div>
        <dl className="mt-9 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {proof.map((p) => (
            <div key={p.label}>
              <dt className="tnum text-3xl font-semibold tracking-tight text-brand-accent sm:text-4xl">
                {p.value}
              </dt>
              <dd className="mt-1.5 text-sm text-muted">{p.label}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
