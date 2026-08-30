/** WP W3-C — the conversion ledger strip on Kvalita leadů.
 *
 *  Three honest facts and two files. The facts: how many qualified / won
 *  conversions the CRM recorded in the last 30 days, and how many of them carry a
 *  Google Click ID. The files: a Google Ads offline-conversion CSV (gclid rows only)
 *  and a hand-mappable Sklik sheet (every row).
 *
 *  THE COVERAGE LINE IS THE POINT. Google matches an offline conversion to a click
 *  by gclid; a conversion without one is not uploadable at all. Showing the count
 *  without the coverage would send the operator to a file that silently contains a
 *  fraction of it. So the share is stated, and when it is low the strip says the
 *  actionable thing: add a `gclid` column to the import.
 *
 *  Server component (it renders a prop, holds no state); the downloads are plain
 *  `<a href>` links, so they carry the session cookie and need no client JS. cs/en. */
import { Pill } from "@/components/ui";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import type { ConversionSummary } from "@/lib/leads/conversion-events";
import { currentUserId } from "@/lib/session";
import { getConversionUploadMapping } from "@/lib/conversions/mapping";

const T = {
  cs: {
    title: "Konverzní ledger",
    window: "posledních 30 dní",
    qualified: "Kvalifikované",
    won: "Uzavřené",
    google: "Google CSV",
    sklik: "Sklik CSV",
    coverage: "{withGclid} z {total} konverzí nese Google Click ID ({pct}).",
    coverageLow: "Doplňte do importu sloupec „gclid“ — bez click ID nelze konverzi nahrát do Google Ads.",
    coverageNone: "Žádná konverze zatím nenese Google Click ID. Do Google Ads nelze nahrát nic; Sklik tabulka obsahuje všechny řádky.",
    sklikNote: "Sklik: ruční mapovací tabulka — sloupce zrcadlí rozhraní Sklik, strojový import Seznam nezveřejňuje.",
    uploadOn: "Nahrávání do Google Ads: aktivní — {action}.",
    uploadOff: "Nahrávání do Google Ads: neaktivní. Zapnout v Nastavení.",
    uploadPaused: "Nahrávání do Google Ads: pozastaveno. Obnovit v Nastavení.",
    empty: "Zatím žádné konverze. Jakmile kontakt posunete na „kvalifikovaný“ nebo „uzavřeno“, zapíše se sem řádek — bez jména, e-mailu i telefonu.",
    updated: "aktualizováno {date}",
    never: "čeká na první přepočet",
  },
  en: {
    title: "Conversion ledger",
    window: "last 30 days",
    qualified: "Qualified",
    won: "Won",
    google: "Google CSV",
    sklik: "Sklik CSV",
    coverage: "{withGclid} of {total} conversions carry a Google Click ID ({pct}).",
    coverageLow: "Add a “gclid” column to your import — without a click ID a conversion cannot be uploaded to Google Ads.",
    coverageNone: "No conversion carries a Google Click ID yet. Nothing can be uploaded to Google Ads; the Sklik sheet holds every row.",
    sklikNote: "Sklik: a hand-mapped sheet — the columns mirror the Sklik UI; Seznam publishes no machine import spec.",
    uploadOn: "Upload to Google Ads: active — {action}.",
    uploadOff: "Upload to Google Ads: off. Turn it on in Settings.",
    uploadPaused: "Upload to Google Ads: paused. Resume it in Settings.",
    empty: "No conversions yet. The moment you move a contact to “qualified” or “won”, a row lands here — with no name, e-mail or phone.",
    updated: "updated {date}",
    never: "awaiting the first rollup",
  },
} as const;

/** Below this share of rows carrying a click id, the strip nudges toward the import
 *  column instead of just stating the number. */
const LOW_COVERAGE = 0.5;

export default async function ConversionLedgerStrip({
  projectId,
  summary,
}: {
  projectId: string;
  /** the rolled-up summary, or null when the `conversion-rollup` step has never run */
  summary: ConversionSummary | null;
}) {
  const t = await getT(T);
  const fmt = await getServerFormatters();

  // WP S3 — the live-upload status line's one fact, read HERE rather than threaded
  // through LeadQualityModule: the mapping is keyed (userId, projectId) and this
  // component only has the project id, and the alternative (a prop through a 439-line
  // parent) would grow a module already over the component ceiling for one sentence.
  // `currentUserId` is the React-cached session read, so it costs no extra round trip
  // on a page that has already resolved the session. Best-effort: a failed read
  // renders "neaktivní", which is the safe direction — this line must never claim an
  // upload is running when it cannot prove one is.
  const uid = await currentUserId().catch(() => null);
  const upload = uid ? await getConversionUploadMapping(uid, projectId).catch(() => null) : null;

  const qualified = summary?.qualified30d ?? 0;
  const won = summary?.won30d ?? 0;
  const total = qualified + won;
  const pct = summary?.gclidPct ?? 0;
  const withGclid = Math.round(pct * total);

  const href = (format: "google" | "sklik", kind: "qualified" | "won") =>
    `/api/projects/${encodeURIComponent(projectId)}/conversions/export?format=${format}&kind=${kind}&days=30`;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line px-5 py-3.5">
        <h3 className="text-sm font-semibold text-navy-800">{t("title")}</h3>
        <span className="text-xs text-muted">{t("window")}</span>
        <span className="ml-auto text-xs text-muted">
          {summary?.updatedAt
            ? t("updated", { date: fmt.fmtDate(summary.updatedAt) })
            : t("never")}
        </span>
      </div>

      {total === 0 ? (
        <p className="px-5 py-4 text-sm leading-relaxed text-muted">{t("empty")}</p>
      ) : (
        <>
          <ul className="divide-y divide-line/70">
            {(
              [
                ["qualified", t("qualified"), qualified],
                ["won", t("won"), won],
              ] as const
            ).map(([kind, label, count]) => (
              <li key={kind} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                <span className="text-sm font-medium text-navy-800">{label}</span>
                <span className="tnum text-sm font-semibold text-navy-800">{fmt.fmtInt(count)}</span>
                <span className="ml-auto flex items-center gap-2">
                  <a
                    className="rounded-card border border-line px-2.5 py-1 text-xs font-medium text-navy-700 hover:border-brand-accent hover:text-brand-accent"
                    href={href("google", kind)}
                  >
                    {t("google")}
                  </a>
                  <a
                    className="rounded-card border border-line px-2.5 py-1 text-xs font-medium text-navy-700 hover:border-brand-accent hover:text-brand-accent"
                    href={href("sklik", kind)}
                  >
                    {t("sklik")}
                  </a>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-start gap-3 border-t border-line px-5 py-3">
            <Pill tone={pct >= LOW_COVERAGE ? "positive" : pct > 0 ? "coral" : "negative"}>
              {fmt.fmtPct(pct)}
            </Pill>
            <p className="text-xs leading-relaxed text-muted">
              {t("coverage", {
                withGclid: fmt.fmtInt(withGclid),
                total: fmt.fmtInt(total),
                pct: fmt.fmtPct(pct),
              })}{" "}
              {pct === 0 ? t("coverageNone") : pct < LOW_COVERAGE ? t("coverageLow") : ""}
            </p>
          </div>
        </>
      )}

      {/* WP S3 — the live-upload status line. Server-rendered from the mapping the
          caller already read: it is one sentence of state, so a client island would
          buy nothing and cost a fetch. It NAMES the conversion action when active,
          because "aktivní" without saying into what is the state an operator most
          needs to be able to double-check. */}
      <div className="border-t border-line px-5 py-3 text-xs text-muted">
        {upload?.status === "approved"
          ? t("uploadOn", { action: upload.conversionAction?.name ?? "—" })
          : upload?.status === "paused"
            ? t("uploadPaused")
            : t("uploadOff")}
      </div>

      <div className="border-t border-line px-5 py-3 text-xs text-muted">{t("sklikNote")}</div>
    </div>
  );
}
