/** Read-only demo view of the Uložený obsah library for the public /dashboard —
 *  the same table the authed SavedContentLibrary renders (title · kind · saved),
 *  fed by illustrative fixture entries instead of the per-project store. No open /
 *  delete affordances: there is no real workspace behind the demo, and disabled
 *  controls would imply one. Server component; dates are fixed fixtures, formatted
 *  absolutely (not relatively) so the demo stays deterministic. */
import { Bookmark, Document } from "@/components/icons";
import { Pill } from "@/components/ui";
import type { SavedContentEntry } from "@/lib/content-library/entries";
import { getServerFormatters, getT } from "@/lib/i18n/server";

const T = {
  cs: {
    heading: "Uložené briefy a koncepty",
    countPill: "{n} uloženo",
    colTitle: "Název",
    colKind: "Obsah",
    colSaved: "Uloženo",
    kindBrief: "Brief",
    kindArticle: "Brief + článek",
    keywordsLabel: "Klíčová slova:",
    hint: "V aplikaci řádek otevře pracovní plochu Obsahového enginu s načteným briefem i konceptem — obsah zůstává u projektu, ne jen v prohlížeči.",
  },
  en: {
    heading: "Saved briefs and drafts",
    countPill: "{n} saved",
    colTitle: "Title",
    colKind: "Content",
    colSaved: "Saved",
    kindBrief: "Brief",
    kindArticle: "Brief + article",
    keywordsLabel: "Keywords:",
    hint: "In the app a row opens the Content engine workspace with the brief and draft restored — saved content stays with the project, not just in your browser.",
  },
} as const;

export default async function DemoSavedContent({ entries }: { entries: SavedContentEntry[] }) {
  const t = await getT(T);
  const fmt = await getServerFormatters();

  return (
    <div className="stagger space-y-4">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Bookmark width={16} height={16} className="text-brand-accent" />
            <h3 className="text-base font-semibold text-navy-800">{t("heading")}</h3>
          </div>
          <Pill tone="neutral">{t("countPill", { n: entries.length })}</Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("colTitle")}</th>
                <th className="px-4 py-3 font-medium">{t("colKind")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colSaved")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-medium text-navy-800">{e.title}</p>
                    {e.brief.keywords.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted">
                        {t("keywordsLabel")} {e.brief.keywords.join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={e.kind === "article" ? "positive" : "neutral"}>
                      {e.kind === "article" ? t("kindArticle") : t("kindBrief")}
                    </Pill>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-muted">
                    <time dateTime={e.savedAt}>{fmt.fmtDate(e.savedAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="flex items-start gap-2 text-sm leading-relaxed text-muted">
        <Document width={15} height={15} className="mt-0.5 shrink-0" aria-hidden />
        {t("hint")}
      </p>
    </div>
  );
}
