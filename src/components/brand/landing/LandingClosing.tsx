/** Homepage closing CTA. Extracted verbatim from BrandLanding (AGENTS.md 200-LOC
 *  rubric); no behaviour change. */
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

export default async function LandingClosing() {
  const t = await getT(T);
  return (
    <section className="border-t border-onyx-line bg-onyx">
      <Container className="py-14">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="max-w-xl text-2xl font-semibold leading-snug tracking-tight text-white">
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
