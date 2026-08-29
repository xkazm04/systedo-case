/** The /sken hero — the promise, stated at the size it can actually be kept.
 *
 *  Deliberately modest copy: one AI call reads one page. It cannot see your ad
 *  account, your margins or your rankings, and the page says so rather than letting
 *  the visitor discover it. The channel plan underneath is curated, not researched
 *  (see SkenPlanTable), and that is stated there too. Server component — the whole
 *  hero is static text and the form lives in the client half. */
import { Container, Eyebrow, Pill } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    eyebrow: "Sken webu",
    heading: "Vložte adresu. Uvidíte, co o vás web říká.",
    lead: "Model přečte jednu stránku — vaši úvodní — a sestaví z ní profil firmy: co prodáváte, komu, jakým tónem, na jaká slova vás lidé hledají a s kým se srovnáváte. K tomu orientační plán kanálů, kde jde získat viditelnost bez rozpočtu.",
    badge: "Bez registrace",
    limitTitle: "Co sken neumí",
    limitBody:
      "Čte jen text té jedné stránky. Nevidí vaše kampaně, marže ani pozice ve vyhledávání — ty se připojují až v aplikaci. Konkurenty navrhuje, neověřuje.",
  },
  en: {
    eyebrow: "Website scan",
    heading: "Paste an address. See what your site says about you.",
    lead: "The model reads one page — your homepage — and builds a business profile from it: what you sell, to whom, in what voice, the words people search you by, and who you are measured against. Plus an indicative plan of channels where visibility costs no budget.",
    badge: "No sign-up",
    limitTitle: "What the scan cannot do",
    limitBody:
      "It reads the text of that one page. It cannot see your campaigns, your margins or your search rankings — those connect inside the app. Competitors are suggested, not verified.",
  },
} as const;

export default async function SkenHero() {
  const t = await getT(T);
  return (
    <section className="border-b border-line">
      <Container className="py-14 lg:py-20">
        <div className="flex flex-wrap items-center gap-3">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <Pill tone="brand">{t("badge")}</Pill>
        </div>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
          {t("heading")}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{t("lead")}</p>
        <div className="mt-7 max-w-2xl rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {t("limitTitle")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-navy-700">{t("limitBody")}</p>
        </div>
      </Container>
    </section>
  );
}
