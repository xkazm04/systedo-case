/** Pobočky / Locations — the location-management roster for a local-SEO project.
 *  Summary tiles + an attention-sorted table (Google profile health, reviews,
 *  map rank, tasks, budget) + a focus panel for the location most in need of a
 *  human. Server component. Controls are honestly gated: the data is illustrative
 *  until a Google Business Profile + live sources are connected. */
import Link from "next/link";
import { Pill, TONE_TEXT } from "@/components/ui";
import type { PillTone } from "@/components/ui";
import { Layers, Pin } from "@/components/icons";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import { fleetSummary, needsAttention, sortByAttention } from "@/lib/locations/compute";
import type { GbpStatus, LocationRow } from "@/lib/locations/sample";

const T = {
  cs: {
    locations: "Pobočky",
    onAutopilot: "Na autopilotu",
    needsYou: "Vyžaduje pozornost",
    unanswered: "Nezodpovězené recenze",
    rating: "Průměrné hodnocení",
    rosterTitle: "Přehled poboček",
    sortedNote: "Řazeno podle naléhavosti",
    colLocation: "Pobočka",
    colServices: "Služby",
    colGbp: "Google profil",
    colAutopilot: "Autopilot",
    colRank: "Pozice v mapě",
    colReviews: "Recenze",
    colTasks: "Úkoly",
    colBudget: "Rozpočet/měs.",
    gbpConnected: "Připojeno",
    gbpAttention: "Vyžaduje akci",
    gbpDisconnected: "Odpojeno",
    autopilotOn: "Zapnuto",
    autopilotOff: "Vypnuto",
    newBadge: "{n} nových",
    flaggedBadge: "{n} označeno",
    tasksNone: "—",
    focusTitle: "Vyžaduje vaši pozornost",
    focusEmpty: "Všechny pobočky jsou v pořádku. Nic nevyžaduje ruční zásah.",
    focusGbp: "Stav Google profilu",
    focusBudget: "Měsíční rozpočet",
    focusTasks: "Otevřené úkoly",
    focusUnanswered: "Nezodpovězené recenze",
    focusDrafts: "Koncepty ke schválení",
    manageBranding: "Branding a nastavení",
    gatingNote: "Ovládací prvky (autopilot, rozpočet, publikování) se aktivují po připojení Google profilu a živých zdrojů. Zobrazená data jsou ilustrativní.",
    servicesUnit: "{n} služeb",
  },
  en: {
    locations: "Locations",
    onAutopilot: "On autopilot",
    needsYou: "Needs attention",
    unanswered: "Unanswered reviews",
    rating: "Average rating",
    rosterTitle: "Locations overview",
    sortedNote: "Sorted by urgency",
    colLocation: "Location",
    colServices: "Services",
    colGbp: "Google profile",
    colAutopilot: "Autopilot",
    colRank: "Map rank",
    colReviews: "Reviews",
    colTasks: "Tasks",
    colBudget: "Budget/mo.",
    gbpConnected: "Connected",
    gbpAttention: "Needs action",
    gbpDisconnected: "Disconnected",
    autopilotOn: "On",
    autopilotOff: "Off",
    newBadge: "{n} new",
    flaggedBadge: "{n} flagged",
    tasksNone: "—",
    focusTitle: "Needs your attention",
    focusEmpty: "Every location is healthy. Nothing needs a manual touch.",
    focusGbp: "Google profile status",
    focusBudget: "Monthly budget",
    focusTasks: "Open tasks",
    focusUnanswered: "Unanswered reviews",
    focusDrafts: "Drafts to approve",
    manageBranding: "Branding & settings",
    gatingNote: "Controls (autopilot, budget, publishing) activate once a Google profile and live sources are connected. The figures shown are illustrative.",
    servicesUnit: "{n} services",
  },
} as const;

const GBP_TONE: Record<GbpStatus, PillTone> = {
  connected: "positive",
  attention: "negative",
  disconnected: "coral",
};

/** Map-pack rank → Pill tone: 1–3 positive, 4–10 warning, 11+ coral. */
function rankTone(rank: number): PillTone {
  if (rank <= 3) return "positive";
  if (rank <= 10) return "negative";
  return "coral";
}

export default async function LocationsModule({
  rows,
  projectId,
}: {
  rows: LocationRow[];
  projectId: string;
}) {
  const fmt = await getServerFormatters();
  const t = await getT(T);

  const s = fleetSummary(rows);
  const sorted = sortByAttention(rows);
  const gbpLabel: Record<GbpStatus, string> = {
    connected: t("gbpConnected"),
    attention: t("gbpAttention"),
    disconnected: t("gbpDisconnected"),
  };
  // The location most in need of a human — drives the focus panel.
  const focus = sorted.find(needsAttention);

  return (
    <div className="stagger space-y-6">
      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("locations")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtInt(s.total)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("onAutopilot")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtInt(s.onAutopilot)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("needsYou")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-coral-600">{fmt.fmtInt(s.needsAttention)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("unanswered")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-coral-600">{fmt.fmtInt(s.unanswered)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("rating")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-positive">{fmt.fmtDecimal(s.avgRating, 1)} ★</p>
        </div>
      </div>

      {/* Roster */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Layers width={18} height={18} className="text-brand-accent" />
            {t("rosterTitle")}
          </h3>
          <span className="text-xs text-muted">{t("sortedNote")}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("colLocation")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colServices")}</th>
                <th className="px-4 py-3 font-medium">{t("colGbp")}</th>
                <th className="px-4 py-3 font-medium">{t("colAutopilot")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("colRank")}</th>
                <th className="px-4 py-3 font-medium">{t("colReviews")}</th>
                <th className="px-4 py-3 font-medium">{t("colTasks")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colBudget")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-navy-800">{r.name}</div>
                    <div className="text-xs text-muted">{r.region}</div>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(r.services)}</td>
                  <td className="px-4 py-3">
                    <Pill tone={GBP_TONE[r.gbp]}>{gbpLabel[r.gbp]}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={r.autopilot ? "positive" : "neutral"}>
                      {r.autopilot ? t("autopilotOn") : t("autopilotOff")}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Pill tone={rankTone(r.mapRank)}>#{r.mapRank}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="tnum font-medium text-positive">{fmt.fmtDecimal(r.rating, 1)} ★</span>
                      <span className="tnum text-xs text-muted">({fmt.fmtInt(r.reviews)})</span>
                      {r.unanswered > 0 && (
                        <span className="tnum rounded-pill bg-coral-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-coral-600">
                          {t("newBadge", { n: r.unanswered })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="tnum text-navy-700">{r.openTasks > 0 ? fmt.fmtInt(r.openTasks) : t("tasksNone")}</span>
                      {r.flagged > 0 && (
                        <span className="tnum rounded-pill bg-coral-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-coral-600">
                          {t("flaggedBadge", { n: r.flagged })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.monthlyBudget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Focus panel — the location most in need of a human */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <Pin width={18} height={18} className="text-brand-accent" />
          <h3 className="text-base font-semibold text-navy-800">{t("focusTitle")}</h3>
        </div>
        {focus ? (
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-navy-800">{focus.name}</div>
                <div className="text-xs text-muted">
                  {focus.region} · {t("servicesUnit", { n: focus.services })}
                </div>
              </div>
              <Pill tone={GBP_TONE[focus.gbp]}>{gbpLabel[focus.gbp]}</Pill>
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FocusStat label={t("focusGbp")} value={gbpLabel[focus.gbp]} />
              <FocusStat label={t("focusBudget")} value={fmt.fmtCZKCompact(focus.monthlyBudget)} />
              <FocusStat label={t("focusTasks")} value={fmt.fmtInt(focus.openTasks)} tone={focus.openTasks > 0 ? "coral" : undefined} />
              <FocusStat label={t("focusUnanswered")} value={fmt.fmtInt(focus.unanswered)} tone={focus.unanswered > 0 ? "coral" : undefined} />
            </dl>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Link
                href={`/app/${projectId}/nastaveni`}
                className="inline-flex items-center gap-2 rounded-pill border border-line px-3.5 py-2 text-sm font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                {t("manageBranding")}
              </Link>
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">{t("gatingNote")}</p>
            </div>
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">{t("focusEmpty")}</p>
        )}
      </div>
    </div>
  );
}

function FocusStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "coral";
}) {
  return (
    <div className="rounded-card border border-line bg-canvas/40 p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={"tnum mt-1 text-lg font-semibold " + (tone ? TONE_TEXT[tone] : "text-navy-800")}>
        {value}
      </dd>
    </div>
  );
}
