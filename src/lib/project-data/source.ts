/** Pure data-source LABEL mapper for the per-project surfaces. Given the honest
 *  `live` signal — the project has actually SYNCED rows, resolved server-side by
 *  `hasSyncedMetrics` / `resolveReportDataset` (see report-metrics) — this returns
 *  the source + human label to render. It deliberately does NOT derive "live"
 *  itself: linking an Ads account is not the same as having synced data, and the
 *  label must never claim "živá data" before the Monthly Report actually shows it.
 *
 *  Framework-free (takes a boolean + a locale, touches no DB) so the client
 *  Settings/Content modules can import it while the server owner passes `live`
 *  down as a prop.
 *
 *  The other modules' live sources (Merchant Center, CRM, Search Console, ESP,
 *  GBP) follow the same sample→live adapter pattern — see
 *  docs/roadmap/integration-backlog.md. */
import type { SupportedLocale } from "@/lib/format";
import type { TDict } from "@/lib/i18n/interpolate";

export interface ProjectDataSource {
  source: "sample" | "google-ads";
  /** the badge text, already in the caller's locale */
  label: string;
  live: boolean;
}

/** The badge copy, cs-source per docs/i18n/contract.md. It lives HERE rather than
 *  in each component's colocated table on purpose: this label is a cross-surface
 *  promise — the overview pill and the settings pill must never disagree about
 *  whether a project is running on the client's own data. Typed `TDict` so adding
 *  a market fails `typecheck` until this column is filled in, exactly like a
 *  colocated table. */
const LABELS: TDict<"live" | "sample"> = {
  cs: { live: "Živá data · Google Ads", sample: "Ukázková data" },
  en: { live: "Live data · Google Ads", sample: "Sample data" },
};

/** Map the honest `live` signal to a source descriptor + label. `live` must come
 *  from synced-rows detection (`hasSyncedMetrics`), never from `adsCustomerId`,
 *  so every surface labels itself consistently (živá vs ukázková data).
 *
 *  `locale` is REQUIRED, with no default: the label used to be a hardcoded Czech
 *  string that rendered untranslated next to properly localized copy on the EN
 *  overview and settings pills, and a defaulted parameter would let the next call
 *  site re-introduce that silently instead of failing `typecheck`. */
export function projectDataSource(live: boolean, locale: SupportedLocale): ProjectDataSource {
  const labels = LABELS[locale] ?? LABELS.cs;
  if (live) {
    return { source: "google-ads", label: labels.live, live: true };
  }
  return { source: "sample", label: labels.sample, live: false };
}
