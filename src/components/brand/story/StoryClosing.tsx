/** THE LAST FRAME — one line and the door. The film already ended on "leave with
 *  the account running"; this band is the credits, not a second pitch. */
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: { line: "Buďte ve své reklamě neoblomní.", start: "Začít zdarma", demo: "Živá ukázka" },
  en: { line: "Be adamant about your ads.", start: "Start free", demo: "Live demo" },
} as const;

export default async function StoryClosing() {
  const t = await getT(T);
  return (
    <section className="border-t border-onyx-line bg-onyx">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t("line")}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400"
          >
            {t("start")}
            <ArrowRight width={17} height={17} />
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-onyx-muted underline decoration-onyx-line underline-offset-4 transition-colors hover:text-brand-200"
          >
            {t("demo")}
          </Link>
        </div>
      </div>
    </section>
  );
}
