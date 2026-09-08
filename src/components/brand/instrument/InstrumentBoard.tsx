"use client";

/** THE BOARD — the one client island of /lp/instrument, and the whole page.
 *
 *  P3 + P7 + P12 + P5: the visitor picks the kind of business they are, and
 *  every band re-composes from the payload the server derived. The switch IS
 *  the motion (one technique on the whole page); the pointer light plays on
 *  the switchboard. State is one string. No fetching, no store, no router. */
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import PointerLight from "@/components/motion/PointerLight";
import { ArrowRight } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import type { ProjectType } from "@/lib/projects/types";
import type { InstrumentPayload } from "./derive";
import Switchboard from "./Switchboard";
import InstrumentHero from "./InstrumentHero";
import { InstrumentPlan, InstrumentSheet } from "./InstrumentPlan";

const T = {
  cs: {
    rail: "Jaký máte projekt?", kicker: "Co uvidíte na první obrazovce", demo: "ukázková data, fiktivní klient",
    lit: "{n} z {total} modulů svítí pro tento typ", plan: "Kde začít zdarma", fit: "sedne", lead: "Přehled vede", focus: "Kanály",
    main: "Kde stojíte", growth: "Kde růst", studio: "Čím naplnit", comms: "Kudy ven", insights: "Co z toho je",
    start: "Začít zdarma jako {type}", demoLink: "Živá ukázka",
  },
  en: {
    rail: "What kind of project is it?", kicker: "What you see on screen one", demo: "demo data, fictional client",
    lit: "{n} of {total} modules lit for this type", plan: "Where to start for free", fit: "fit", lead: "The overview leads with", focus: "Channels",
    main: "Where you stand", growth: "Where to grow", studio: "What to fill it with", comms: "How it goes out", insights: "What came of it",
    start: "Start free as {type}", demoLink: "Live demo",
  },
} as const;

export default function InstrumentBoard({ payload }: { payload: InstrumentPayload }) {
  const t = useT(T);
  const [type, setType] = useState<ProjectType>(payload.types[0] ?? "eshop");
  const view = payload.views[type];
  const sectionLabels = { main: t("main"), growth: t("growth"), studio: t("studio"), comms: t("comms"), insights: t("insights") };

  return (
    <div className="bg-onyx text-onyx-ink">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:gap-8 lg:py-10">
        {/* THE RAIL — a segmented control on a phone, a panel on a desk */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="relative isolate overflow-hidden rounded-card border border-onyx-line">
            <Image src="/brand/monolith/instrument-panel.jpg" alt="" fill sizes="220px" className="-z-10 object-cover object-right opacity-40" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-onyx/40 to-onyx/85" />
            <p className="px-4 pt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-brand-300">{t("rail")}</p>
            <div role="group" aria-label={t("rail")} className="no-scrollbar flex gap-1 overflow-x-auto p-3 lg:flex-col">
              {payload.types.map((ty, i) => {
                const on = ty === type;
                return (
                  <button
                    key={ty}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setType(ty)}
                    className={`flex shrink-0 items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                      on ? "border-brand-400/60 bg-brand-500/15 text-white" : "border-onyx-line/60 text-onyx-muted hover:border-onyx-line hover:text-white"
                    }`}
                  >
                    <span className={`font-mono text-[11px] ${on ? "text-brand-300" : "text-onyx-muted"}`}>{String(i + 1).padStart(2, "0")}</span>
                    {payload.views[ty].label}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* THE INSTRUMENT */}
        <div className="flex min-w-0 flex-col gap-5">
          <InstrumentHero view={view} kicker={t("kicker")} demoNote={t("demo")} />
          <PointerLight>
            <Switchboard
              board={payload.board}
              lit={view.lit}
              sectionLabels={sectionLabels}
              litLine={t("lit", { n: String(view.lit.length), total: String(payload.total) })}
            />
          </PointerLight>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <InstrumentPlan view={view} title={t("plan")} fitLabel={t("fit")} />
            <InstrumentSheet view={view} labels={{ lead: t("lead"), focus: t("focus") }} />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2">
            <Link href="/app" className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400">
              {t("start", { type: view.label })} <ArrowRight width={17} height={17} />
            </Link>
            <Link href="/dashboard" className="text-sm font-medium text-onyx-muted underline decoration-onyx-line underline-offset-4 transition-colors hover:text-brand-200">
              {t("demoLink")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
