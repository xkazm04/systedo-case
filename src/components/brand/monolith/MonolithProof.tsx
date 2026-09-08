/** MONOLITH PROOF — technique 4 of 5: STACKING CARDS, and technique 4b, the
 *  sequencing lesson.
 *
 *  Each slab pins and the next slides OVER it instead of pushing it off the
 *  screen (globals.css `.mono-stack`, pure `position: sticky`). Where sticky is
 *  unavailable it degrades to a plain vertical list of four cards — nothing to
 *  guard, nothing to break.
 *
 *  WHY ONE NUMBER PER SLAB. The shipped band renders these four KPIs as a
 *  four-up `<dl>`, which is exactly the failure the reference video names: four
 *  figures arriving together read as a TABLE, and a table is something you skim
 *  past. Arriving one at a time they read as calm, and each one gets room to say
 *  what it actually means. The stacking technique and the sequencing lesson turn
 *  out to be the same move here, so this band spends one technique, not two.
 *
 *  THE NUMBERS ARE UNCHANGED and so is their labelling. `buildSnapshot("90d")`
 *  is the same call the dashboard makes for the fictional demo client, and the
 *  demo-data badge stays unmissable — these are not customer results and no
 *  amount of new visual confidence is allowed to imply that they are. */
import Image from "next/image";
import { Container } from "@/components/ui";
import { buildSnapshot } from "@/lib/snapshot";
import { fmtMultiple, fmtPct, fmtSignedPct, fmtCZKCompact } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    proofLabel: "Důkaz",
    proofHeadline: "Na ukázkovém účtu, posledních 90 dní",
    proofDemoBadge: "Ukázková data: fiktivní klient",
    proofNote:
      "Stejná čísla, jaká dashboard vykresluje pro {client} ({domain}), fiktivního ukázkového klienta. Nejde o výsledky reálného zákazníka.",
    proofRoas: "ROAS portfolia",
    proofRoasNote: "Kolik korun obratu připadá na korunu výdajů za reklamu, přes celé portfolio kampaní.",
    proofPno: "PNO · cíl {goal}",
    proofPnoNote: "Podíl nákladů na obratu proti cíli, který si účet nastavil — ne proti cíli, který by vypadal lépe.",
    proofRevenue: "obrat připsaný marketingu",
    proofRevenueNote: "Jen to, co se dá připsat měřeným kanálům. Zbytek účtu se sem nepočítá.",
    proofRevenueDelta: "obrat vs. předchozí období",
    proofRevenueDeltaNote: "Proti stejně dlouhému období těsně před ním, takže sezóna nepomáhá ani neškodí dvakrát.",
  },
  en: {
    proofLabel: "Proof",
    proofHeadline: "On the demo account, last 90 days",
    proofDemoBadge: "Demo data: fictional client",
    proofNote:
      "The same numbers the dashboard renders for {client} ({domain}), a fictional demo client. Not real customer results.",
    proofRoas: "Portfolio ROAS",
    proofRoasNote: "Revenue returned per unit of ad spend, across the whole portfolio of campaigns.",
    proofPno: "PNO · target {goal}",
    proofPnoNote: "Cost share of revenue against the target this account set — not against a target that would look better.",
    proofRevenue: "revenue attributed to marketing",
    proofRevenueNote: "Only what can be attributed to measured channels. The rest of the account does not count here.",
    proofRevenueDelta: "revenue vs. prior period",
    proofRevenueDeltaNote: "Against the equally long window immediately before it, so a season cannot help or hurt twice.",
  },
} as const;

export default async function MonolithProof() {
  const t = await getT(T);
  const snap = buildSnapshot("90d");

  const proof = [
    { value: fmtMultiple(snap.current.roas), label: t("proofRoas"), note: t("proofRoasNote") },
    {
      value: fmtPct(snap.current.pno),
      label: t("proofPno", { goal: fmtPct(snap.goalPno, 0) }),
      note: t("proofPnoNote"),
    },
    { value: fmtCZKCompact(snap.current.revenue), label: t("proofRevenue"), note: t("proofRevenueNote") },
    {
      value: fmtSignedPct(snap.delta.revenue),
      label: t("proofRevenueDelta"),
      note: t("proofRevenueDeltaNote"),
    },
  ];

  return (
    <section className="border-b border-line bg-canvas">
      <Container className="py-16 lg:py-20">
        {/* The instrument surface: a raking-light plate with one line rising
            across it. It states what the band is before a single figure lands. */}
        <div className="relative isolate overflow-hidden rounded-card border border-onyx-line bg-onyx px-6 py-10 text-onyx-ink sm:px-10">
          <div className="absolute inset-0 -z-10" aria-hidden>
            <Image
              src="/brand/monolith/band-proof.jpg"
              alt=""
              fill
              sizes="(max-width: 1152px) 100vw, 1152px"
              className="object-cover opacity-70 mix-blend-screen"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-onyx via-onyx/70 to-onyx/30" />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-300">
                  {t("proofLabel")}
                </p>
                {/* Unmissable demo-data label: the numbers below belong to a
                    fictional client, and that must never read as fine print. */}
                <span className="inline-flex items-center rounded-pill border border-onyx-line bg-onyx-soft px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-onyx-ink">
                  {t("proofDemoBadge")}
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
                {t("proofHeadline")}
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-onyx-muted">
              {t("proofNote", { client: snap.client.name, domain: snap.client.domain })}
            </p>
          </div>
        </div>

        {/* THE STACK. Each slab pins under the one before it; the exposed strip
            of the previous slab is what makes the pile legible as a pile. */}
        <dl className="mono-stack mt-10">
          {proof.map((p) => (
            <div
              key={p.label}
              // `sm:min-h` is what makes the pile READ as a pile: a 150px card
              // pinned at 5.5rem is overtaken by the next before the reader has
              // registered it, and the band degenerates into a plain list. Each
              // slab holds about a third of a viewport before the next slides
              // over it. Below `sm` there is no stack (globals.css), so the tall
              // card would be empty space and the list just breathes instead.
              className="mb-6 grid grid-cols-1 items-center gap-6 rounded-card border border-line bg-surface px-6 py-9 shadow-card sm:mb-4 sm:min-h-[34vh] sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:gap-10 sm:px-10"
            >
              <dt className="tnum text-5xl font-semibold leading-none tracking-tight text-brand-accent sm:text-6xl lg:text-7xl">
                {p.value}
              </dt>
              <dd>
                <span className="block text-base font-semibold text-navy-800">{p.label}</span>
                <span className="mt-2 block text-sm leading-relaxed text-muted">{p.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
