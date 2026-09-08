/** THE STAGE — every scene's elements, present at once, server-rendered.
 *
 *  P2: the set is planes. Far (the lattice to a vanishing point), the desk the
 *  project is built on, a veil the reader looks through, and — only at the end —
 *  the finished account's surface. The protagonist's pieces sit between the desk
 *  and the veil, each tagged `data-for` so globals.css can move it per scene.
 *
 *  Nothing in here is interactive and nothing is focusable: the stage is
 *  `aria-hidden` by its wrapper, the captions carry the text, and the closing
 *  band carries the links. A link inside a hidden decoration is the a11y
 *  failure this file exists to avoid. */
import Image from "next/image";
import StoryField, { type FieldData } from "./StoryField";

export interface StageData extends FieldData {
  domain: string;
  facets: { label: string; values: string[] }[];
}

export default function StoryStage({ data }: { data: StageData }) {
  return (
    <div className="relative h-full w-full bg-onyx text-onyx-ink">
      {/* PLANES */}
      <Image src="/brand/monolith/hero-far.jpg" alt="" fill priority sizes="100vw" className="object-cover opacity-80" />
      <div className="absolute inset-x-0 bottom-0 h-[62%]">
        <Image
          src="/brand/monolith/story-desk.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-top mix-blend-screen"
        />
      </div>
      <div data-for="final" className="absolute inset-0">
        <Image src="/brand/monolith/story-account.jpg" alt="" fill sizes="100vw" className="object-cover opacity-90 mix-blend-screen" />
      </div>
      <div className="absolute inset-0 opacity-25">
        <Image src="/brand/monolith/hero-veil.jpg" alt="" fill sizes="100vw" className="object-cover mix-blend-screen" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-onyx via-onyx/10 to-onyx/50" />

      {/* THE PROTAGONIST — centred on the desk */}
      {/* on a desk the captions own the left third, so the protagonist keeps to the right of it */}
      <div className="absolute inset-x-0 top-[6%] bottom-[6%] mx-auto flex max-w-5xl flex-col items-center justify-center px-4 sm:top-[10%] sm:bottom-[8%] sm:px-6 lg:left-[41%] lg:right-[2%] lg:mx-0 lg:max-w-none">
        {/* scene 0 — the address */}
        <div data-for="url" className="absolute top-[38%] flex items-center gap-0 rounded-pill border border-onyx-line bg-onyx-soft/80 px-5 py-3 font-mono text-base text-white shadow-pop sm:top-[34%] sm:px-6 sm:py-4 sm:text-2xl">
          <span className="text-onyx-muted">https://</span>
          <span>{data.domain}</span>
          <span className="story-caret ml-1 inline-block h-[1.1em] w-[2px] bg-brand-300" />
        </div>

        {/* scene 1 — the three facets */}
        <div data-for="chips" className="absolute top-[20%] flex w-full max-w-3xl flex-wrap justify-center gap-2 sm:top-[30%] sm:gap-3">
          {data.facets.map((f) => (
            <div key={f.label} className="max-w-[16rem] rounded-card border border-onyx-line bg-onyx-soft/80 px-3 py-2 shadow-card sm:px-4 sm:py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-300">{f.label}</p>
              <p className="mt-1 truncate text-sm text-white">{f.values.slice(0, 3).join(" · ") || "—"}</p>
            </div>
          ))}
        </div>

        {/* scenes 2–5 — the field, the line, the figures */}
        <StoryField data={data} />
      </div>
    </div>
  );
}
