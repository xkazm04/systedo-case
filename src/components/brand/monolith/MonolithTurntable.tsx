/** MONOLITH TURNTABLE — technique 3 of 5: SCROLL-DRIVEN ROTATION.
 *
 *  The monolith is not playing an animation. Your scroll position is turning it,
 *  and scrolling back turns it the other way (globals.css `.mono-prism`, a
 *  view() timeline over the band's whole pass across the viewport).
 *
 *  WHY THIS IS A REAL 3D OBJECT AND NOT A FRAME SEQUENCE. The obvious way to
 *  build this is to generate 24–36 renders of the same object at 15° apart and
 *  swap them by scroll offset. It does not work: diffusion has no camera
 *  parameter, so 36 generations of "the same monolith, turned" are 36 different
 *  monoliths and the result flickers. Twelve flat panels on a 30° pitch — the
 *  geometry of a dodecagonal prism, radius = width × 1/(2·tan15°) = width × 1.866
 *  — are coherent by construction, weigh three textures instead of thirty-six
 *  frames, and turn at any angle the reader stops on. Leonardo's job here is the
 *  MATERIAL (scripts/brand-assets.manifest.json: facet-a/b/c), which is the job
 *  a generative model is actually good at.
 *
 *  Lighting is faked the way it always is in CSS 3D: the panels carry no shading
 *  of their own, and one fixed overlay above the prism darkens whichever side has
 *  rotated away. Caps are unnecessary because the stage fades out top and bottom.
 *
 *  The whole thing is `aria-hidden`: it is a decoration that argues for the text
 *  beside it, and a screen reader gets that text. Zero JavaScript. */
import Image from "next/image";
import { Container } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

/** Six faces on a 60° pitch. The three generated skins cycle so no two adjacent
 *  faces are the same stone, and the lit and seam faces sit opposite each other:
 *  whichever way the reader scrolls, a face with an edge highlight is arriving
 *  while one is leaving. Teal appears on two faces in six — DESIGN.md rations
 *  this colour deliberately, and a hexagon that glowed on every face would not. */
const PANEL_SKINS = ["facet-a", "facet-b", "facet-c", "facet-b", "facet-a", "facet-b"] as const;

const T = {
  cs: {
    eyebrow: "Jeden projekt",
    heading: "Drží ze všech stran.",
    sub: "Kanály zdarma, placené kampaně, obsah a měření nejsou čtyři nástroje vedle sebe. Je to jeden projekt, na který se díváte ze čtyř stran — a čísla si na žádné z nich neodporují.",
    faces: "Rolujte a otočte si ho.",
    f1: "Kanály zdarma",
    f1Note: "kde se dá zviditelnit bez rozpočtu",
    f2: "Kampaně",
    f2Note: "živá data z Google Ads, triáž a rozpočty",
    f3: "Obsah",
    f3Note: "články, sociální sítě, kreativa",
    f4: "Měření",
    f4Note: "jedna sada čísel pro všechny čtyři",
  },
  en: {
    eyebrow: "One project",
    heading: "It holds up from every angle.",
    sub: "Free channels, paid campaigns, content and measurement are not four tools sitting next to each other. They are one project seen from four sides — and the numbers do not contradict each other on any of them.",
    faces: "Scroll to turn it.",
    f1: "Free channels",
    f1Note: "where you can be found with no budget",
    f2: "Campaigns",
    f2Note: "live Google Ads data, triage and budgets",
    f3: "Content",
    f3Note: "articles, social, creative",
    f4: "Measurement",
    f4Note: "one set of numbers for all four",
  },
} as const;

export default async function MonolithTurntable() {
  const t = await getT(T);
  const faces = [
    { title: t("f1"), note: t("f1Note") },
    { title: t("f2"), note: t("f2Note") },
    { title: t("f3"), note: t("f3Note") },
    { title: t("f4"), note: t("f4Note") },
  ];

  return (
    <section className="relative isolate overflow-hidden border-b border-onyx-line bg-onyx text-onyx-ink">
      <Container className="py-20 lg:py-28">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          {/* THE OBJECT ------------------------------------------------------ */}
          <div className="mono-stage relative order-2 h-[340px] sm:h-[420px] lg:order-1 lg:h-[520px]" aria-hidden>
            {/* the pool of light the monument stands in */}
            <div className="absolute left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/20 blur-[80px]" />

            {/* --r is the apothem: face width × 1/(2·tan30°) = width × 0.866, so
                the six faces meet edge to edge and the column is 2·--r across. */}
            <div className="mono-prism relative mx-auto h-full w-[96px] [--r:83px] sm:w-[116px] sm:[--r:100px] lg:w-[132px] lg:[--r:114px]">
              {PANEL_SKINS.map((skin, i) => (
                // position IS the identity here: face 3 is the face at 120°, and
                // the CSS places each one by nth-child — the index is the model.
                <div key={i} className="mono-panel overflow-hidden">
                  <Image src={`/brand/monolith/${skin}.jpg`} alt="" fill sizes="140px" className="object-cover" />
                  {/* per-face shading: without it six identical rectangles read as
                      a flat ribbon rather than as an edge turning towards you */}
                  <span className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-black/55" />
                </div>
              ))}
            </div>

            {/* EVERY overlay below needs an explicit z-index. The panels are
                translated on Z inside a perspective, which puts them physically
                nearer the camera than an untransformed sibling — without `z-10`
                the fades paint UNDER the object and the open top edge shows. */}

            {/* Fixed lighting: the prism turns underneath it, so whichever face
                has rotated to the right goes dark. This is the shading a CSS 3D
                transform will not do for you. */}
            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-transparent via-transparent to-onyx/85" />
            {/* A key light fixed to the STAGE, not to the object: at some angles
                every visible face is a dark one, and a column with no lit edge
                stops reading as a solid turning in space. */}
            <div className="pointer-events-none absolute inset-y-0 left-[32%] z-10 w-[10%] bg-gradient-to-r from-brand-300/30 to-transparent blur-[2px]" />
            {/* No top or bottom cap is modelled, so the stage dissolves instead
                of showing that the prism is open at both ends. The fades reach
                PAST the stage box on purpose: rotateX(-7deg) on a 520px column
                pushes its ends about 30px outside that box, and a fade pinned to
                the box leaves exactly that sliver of open tube showing. */}
            <div className="pointer-events-none absolute -inset-x-8 -top-12 z-10 h-48 bg-gradient-to-b from-onyx via-onyx/95 to-transparent" />
            <div className="pointer-events-none absolute -inset-x-8 -bottom-12 z-10 h-48 bg-gradient-to-t from-onyx via-onyx/95 to-transparent" />
          </div>

          {/* THE ARGUMENT ---------------------------------------------------- */}
          <div className="order-1 lg:order-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-300">
              {t("eyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-5xl">
              {t("heading")}
            </h2>
            <p className="mt-5 max-w-xl leading-relaxed text-onyx-muted">{t("sub")}</p>

            <ul className="mono-seq mt-9 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-onyx-line bg-onyx-line sm:grid-cols-2">
              {faces.map((f) => (
                <li key={f.title} className="bg-onyx-soft/70 px-5 py-4">
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-onyx-muted">{f.note}</p>
                </li>
              ))}
            </ul>

            <p className="mt-5 text-[12px] font-medium uppercase tracking-[0.16em] text-onyx-muted">
              {t("faces")}
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
