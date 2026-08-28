/** The self-host band on `/cena` — the local-first COMMITMENT, stated with the
 *  same honesty pattern as the paid tiers' "Coming after validation": what it will
 *  be (same software, unmetered, AGPL — mirrors README "License & self-hosting")
 *  plus an explicit not-functional-yet status chip, because a production build
 *  still requires Firestore + Google OAuth today.
 *
 *  No numbers here on purpose — there is nothing for it to drift from
 *  `lib/plans.ts`, which is why it is a plain copy band and not a derived one. */
import { Pill } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    heading: "Provozujte sami",
    status: "Připravujeme — self-hosting zatím není funkční",
    body: "Stejný software, žádná odlehčená edice: Adamant je pod licencí AGPL a je zamýšlen tak, aby běžel na vašem stroji, na vašich modelech, nad vašimi daty — bez plánů a bez kvót. Zatím to ale neumí: produkční build se dnes neobejde bez Firestore a přihlášení Googlem. Pracujeme na tom.",
  },
  en: {
    heading: "Run it yourself",
    status: "In preparation — self-hosting is not functional yet",
    body: "The same software, no lite edition: Adamant is AGPL-licensed and meant to run on your machine, on your models, on your data — no plans, no quotas. It cannot do that yet: a production build still requires Firestore and Google sign-in today. We are working on it.",
  },
} as const;

export default async function SelfHostBand() {
  const t = await getT(T);
  return (
    <div className="card mx-auto mt-12 max-w-3xl p-7">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-navy-800">{t("heading")}</h2>
        <Pill tone="neutral">{t("status")}</Pill>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{t("body")}</p>
    </div>
  );
}
