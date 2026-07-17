import { Pill } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    badge: "Data nedostupná",
    defaultNote:
      "Data se teď nepodařilo načíst (dočasný výpadek backendu). Zkuste to prosím za chvíli — nezobrazujeme zde ukázková data, aby se nepletla s vaší reálnou historií.",
  },
  en: {
    badge: "Data unavailable",
    defaultNote:
      "We couldn't load this data right now (a temporary backend outage). Please try again shortly — we intentionally don't fall back to sample data here so it can't be mistaken for your real history.",
  },
} as const;

/** Honest "this data couldn't be read right now" state for modules whose live
 *  read FAILED — distinct from a genuinely empty/fresh project (which shows the
 *  seeded sample). Prevents a backend outage from presenting fabricated events or
 *  spend as the tenant's own timeline. Server component. */
export default async function DataUnavailableNote({ note }: { note?: string }) {
  const t = await getT(T);
  return (
    <div className="card flex flex-wrap items-center gap-2 px-5 py-10 text-sm text-muted">
      <Pill tone="coral">{t("badge")}</Pill>
      <span>{note ?? t("defaultNote")}</span>
    </div>
  );
}
