/** MONOLITH CLOSING — the seal.
 *
 *  Deliberately the QUIETEST band on the page. Four techniques have already run
 *  by the time a reader gets here, and the rule the page is built on is that only
 *  one thing moves at a time; the closing band's job is to stop moving and ask
 *  for the click. Its single piece of motion is the shared `.reveal-on-scroll`
 *  fade every other marketing band in the tree already uses.
 *
 *  Copy is the shipped closing band's, verbatim. */
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    closingTitle: "Buďte ve své reklamě neoblomní.",
    heroSeeDemo: "Podívejte se na živou ukázku",
    heroStartFree: "Začít zdarma",
  },
  en: {
    closingTitle: "Be adamant about your ads.",
    heroSeeDemo: "See a live example",
    heroStartFree: "Start free",
  },
} as const;

export default async function MonolithClosing() {
  const t = await getT(T);
  return (
    <section className="reveal-on-scroll relative isolate overflow-hidden border-t border-onyx-line bg-onyx">
      <div className="absolute inset-0 -z-10" aria-hidden>
        <Image
          src="/brand/monolith/closing-seal.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-60 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-onyx via-onyx/75 to-onyx/40" />
      </div>

      <Container className="py-20">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="max-w-xl text-2xl font-semibold leading-snug tracking-tight text-white sm:text-3xl">
            {t("closingTitle")}
          </h2>
          <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400"
            >
              {t("heroStartFree")}
              <ArrowRight width={17} height={17} />
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-onyx-muted underline decoration-onyx-line underline-offset-4 transition-colors hover:text-brand-200"
            >
              {t("heroSeeDemo")}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
