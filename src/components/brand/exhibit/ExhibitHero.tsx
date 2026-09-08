/** EXHIBIT 01 — the instrument itself, before a word of pitch (P3).
 *
 *  The right seven columns are the live demo dashboard's own numbers on a
 *  spotlit plinth: the real Sparkline over the real 90-day revenue series and
 *  the four figures the dashboard renders. The left three columns are the
 *  exhibit label — a mono eyebrow with a glowing dot, the display line at the
 *  Orbital Garden scale (clamp, .92 leading, tight tracking), and an intro that
 *  may not exceed 280px. That asymmetry is the astra showcase's 7/5 rhythm
 *  applied to the hero. Layered (P2): wall, plinth, chart, veil. */
import Image from "next/image";
import Sparkline from "@/components/charts/Sparkline";
import type { SupportedLocale } from "@/lib/format";

export interface Figure {
  value: string;
  label: string;
}

export default function ExhibitHero({
  n,
  of,
  eyebrow,
  title1,
  title2,
  intro,
  demoNote,
  client,
  series,
  figures,
  locale,
}: {
  n: number;
  of: number;
  eyebrow: string;
  title1: string;
  title2: string;
  intro: string;
  demoNote: string;
  client: { name: string; domain: string };
  series: number[];
  figures: Figure[];
  locale: SupportedLocale;
}) {
  return (
    <section className="exhibit-noise relative isolate overflow-hidden border-b border-onyx-line bg-onyx text-onyx-ink">
      <div className="absolute inset-0 -z-10" aria-hidden>
        <Image src="/brand/monolith/exhibit-wall.jpg" alt="" fill priority sizes="100vw" className="object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-onyx via-transparent to-onyx/40" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-4 pt-16 pb-14 sm:px-6 lg:grid-cols-12 lg:items-end lg:pt-24 lg:pb-20">
        {/* the label */}
        <div className="lg:col-span-5">
          <p className="exhibit-dot font-mono text-[12px] uppercase tracking-[0.18em] text-brand-300">
            {eyebrow} {String(n).padStart(2, "0")} / {String(of).padStart(2, "0")}
          </p>
          <h1 className="mt-7 text-[clamp(2.5rem,4.6vw,4.4rem)] font-semibold leading-[0.96] tracking-[-0.035em] text-white [text-wrap:balance]">
            <span className="block">{title1}</span>
            <span className="block text-brand-300">{title2}</span>
          </h1>
          <p className="mt-7 max-w-[280px] text-sm leading-[1.9] text-onyx-muted">{intro}</p>
        </div>

        {/* the instrument, on its plinth */}
        <div className="relative lg:col-span-7">
          <div className="relative isolate overflow-hidden rounded-card border border-onyx-line shadow-pop">
            <Image src="/brand/monolith/exhibit-plate.jpg" alt="" fill sizes="(max-width: 1024px) 100vw, 760px" className="-z-10 object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-onyx/40 via-transparent to-onyx/70" />

            <div className="flex items-baseline justify-between gap-4 px-6 pt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-onyx-muted">
              <span>
                {client.name} · {client.domain}
              </span>
              <span className="text-brand-300">{demoNote}</span>
            </div>

            <div className="px-6 pt-8">
              <Sparkline
                values={series}
                width={760}
                height={200}
                responsive
                area
                areaOpacity={0.14}
                dot
                baseline
                stroke="var(--color-brand-400)"
                fill="var(--color-brand-500)"
                strokeWidth={2.5}
                locale={locale}
                describe
                className="h-44 w-full sm:h-56"
              />
            </div>

            <dl className="mono-seq grid grid-cols-2 gap-x-5 gap-y-6 border-t border-onyx-line/70 px-6 py-6 lg:grid-cols-4">
              {figures.map((f) => (
                <div key={f.label}>
                  <dt className="tnum min-w-0 break-words font-mono text-xl text-white sm:text-2xl">{f.value}</dt>
                  <dd className="mt-1.5 text-[12px] leading-snug text-onyx-muted">{f.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
