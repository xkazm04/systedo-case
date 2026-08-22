"use client";

/** The detail pane: who this is, what happened, and what we are allowed to send
 *  them. Three tabs, deliberately in that order — the timeline first because it is
 *  the thing an aggregate importer could never give, consents last because they are
 *  a legal record rather than a daily read.
 *
 *  A sample contact has no stored timeline (nothing was ever written), so the fetch
 *  is skipped entirely rather than firing a 404 and rendering an error the operator
 *  cannot act on. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Pill } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import { sourceLabel } from "@/lib/leads/aggregate";
import { consentInForce, CONSENT_PURPOSES, isErased, type Activity, type Contact } from "@/lib/leads/types";
import { seedTwinReply, schrankaHref } from "./handoff";
import { STAGE_T, STAGE_TONE } from "./copy";
import LeadStageControl from "./LeadStageControl";

const T = {
  cs: {
    tabTimeline: "Časová osa", tabOverview: "Přehled", tabConsent: "Souhlasy",
    empty: "Vyberte kontakt vlevo.",
    unnamed: "Neznámý kontakt",
    erased: "Kontakt byl smazán na žádost subjektu údajů. Zůstala jen anonymní kostra pro statistiky.",
    noTimeline: "Zatím žádné záznamy.",
    sampleTimeline: "Ukázkový kontakt — časová osa se plní až u reálných leadů.",
    score: "Fit {fit} · Zájem {eng} · {grade}",
    firstSeen: "První kontakt", lastActivity: "Poslední aktivita", source: "Zdroj",
    campaign: "Kampaň", owner: "Vlastník", tags: "Štítky", notes: "Poznámka", none: "—",
    consentNone: "Nezaznamenán žádný souhlas. Bez záznamu marketingovou zprávu neposílejte — § 7 zák. 480/2004 Sb.",
    granted: "Uděleno", denied: "Neuděleno",
    basis: "právní základ: {basis}", origin: "zdroj: {origin}",
    purpose_service: "Odpověď na poptávku",
    purpose_marketing_email: "Marketing e-mailem",
    purpose_marketing_sms: "Marketing SMS",
    purpose_profiling: "Profilování",
    reply: "Odpovědět dvojníkem",
    loading: "Načítám…",
  },
  en: {
    tabTimeline: "Timeline", tabOverview: "Overview", tabConsent: "Consents",
    empty: "Pick a contact on the left.",
    unnamed: "Unnamed contact",
    erased: "This contact was erased on the data subject's request. Only an anonymous statistical skeleton remains.",
    noTimeline: "Nothing recorded yet.",
    sampleTimeline: "Sample contact — the timeline fills up once real leads arrive.",
    score: "Fit {fit} · Engagement {eng} · {grade}",
    firstSeen: "First seen", lastActivity: "Last activity", source: "Source",
    campaign: "Campaign", owner: "Owner", tags: "Tags", notes: "Note", none: "—",
    consentNone: "No consent on record. Do not send a marketing message without one — Czech Act 480/2004 Coll., § 7.",
    granted: "Granted", denied: "Not granted",
    basis: "lawful basis: {basis}", origin: "origin: {origin}",
    purpose_service: "Answering the enquiry",
    purpose_marketing_email: "Email marketing",
    purpose_marketing_sms: "SMS marketing",
    purpose_profiling: "Profiling",
    reply: "Reply with the twin",
    loading: "Loading…",
  },
} as const;

type Tab = "timeline" | "overview" | "consent";

export default function LeadDetail({
  projectId,
  contact,
  live,
  onStageChange,
}: {
  projectId: string;
  contact: Contact | null;
  live: boolean;
  onStageChange: (stage: string, reason?: string) => Promise<void>;
}) {
  const t = useT(T);
  const stage = useT(STAGE_T);
  const fmt = useFormatters();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("timeline");
  /** Keyed by the contact it belongs to, so switching rows shows the loading state
   *  by DERIVATION rather than by resetting state inside an effect. */
  const [loaded, setLoaded] = useState<{ id: string; items: Activity[] } | null>(null);

  const id = contact?.id ?? null;
  const isSample = Boolean(id?.startsWith("sample-"));
  const timeline = loaded && loaded.id === id ? loaded.items : null;

  useEffect(() => {
    if (!id || isSample) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/crm/contacts/${encodeURIComponent(id)}`);
        const json = (await res.json()) as { timeline?: Activity[] };
        if (!cancelled) setLoaded({ id, items: json.timeline ?? [] });
      } catch {
        if (!cancelled) setLoaded({ id, items: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isSample, projectId]);

  if (!contact) {
    return (
      <div className="card grid place-items-center p-10 text-center text-sm text-muted">{t("empty")}</div>
    );
  }

  const erased = isErased(contact);
  const name = erased ? t("erased") : (contact.name ?? contact.email ?? contact.phone ?? t("unnamed"));
  const contactLine = [contact.email, contact.phone].filter(Boolean).join(" · ");

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex flex-col gap-3 px-5 pt-5">
        <div>
          <h3 className="text-base font-semibold text-navy-800">{name}</h3>
          {!erased && contactLine && <p className="mt-0.5 text-xs text-muted">{contactLine}</p>}
        </div>
        {!erased && (
          <div className="flex flex-wrap gap-2">
            <Pill tone={STAGE_TONE[contact.stage]}>{stage(contact.stage)}</Pill>
            {contact.score && (
              <Pill tone="brand">
                {t("score", {
                  fit: fmt.fmtInt(contact.score.fit),
                  eng: fmt.fmtInt(contact.score.engagement),
                  grade: contact.score.grade,
                })}
              </Pill>
            )}
          </div>
        )}
        <div className="flex gap-4 border-b border-line">
          {(
            [
              ["timeline", t("tabTimeline")],
              ["overview", t("tabOverview")],
              ["consent", t("tabConsent")],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`-mb-px border-b-2 px-0.5 py-2 text-xs font-semibold transition-colors ${
                tab === key ? "border-brand-500 text-brand-accent" : "border-transparent text-muted hover:text-navy-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-5 py-4">
        {tab === "timeline" &&
          (isSample ? (
            <p className="text-sm text-muted">{t("sampleTimeline")}</p>
          ) : timeline === null ? (
            <p className="text-sm text-muted">{t("loading")}</p>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-muted">{t("noTimeline")}</p>
          ) : (
            <ol className="space-y-4">
              {timeline.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-800">{a.summary}</p>
                    {a.body && <p className="mt-0.5 text-xs leading-relaxed text-muted">{a.body}</p>}
                    <p className="tnum mt-0.5 text-xs text-muted">{fmt.fmtDateTime(a.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ))}

        {tab === "overview" && (
          <dl className="space-y-2.5 text-xs">
            <Row label={t("firstSeen")} value={fmt.fmtDateTime(contact.firstSeenAt)} />
            <Row label={t("lastActivity")} value={fmt.fmtDateTime(contact.lastActivityAt)} />
            <Row label={t("source")} value={sourceLabel(contact.attribution)} />
            <Row label={t("campaign")} value={contact.attribution.campaign ?? t("none")} />
            <Row label={t("owner")} value={contact.ownerId ?? t("none")} />
            <Row label={t("tags")} value={contact.tags.length ? contact.tags.join(", ") : t("none")} />
            <Row label={t("notes")} value={contact.notes ?? t("none")} />
          </dl>
        )}

        {tab === "consent" &&
          (contact.consent.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted">{t("consentNone")}</p>
          ) : (
            <ul className="space-y-3">
              {CONSENT_PURPOSES.map((p) => {
                const rec = consentInForce(contact.consent, p);
                if (!rec) return null;
                return (
                  <li key={p} className="text-xs">
                    <span className="font-medium text-navy-800">{t(`purpose_${p}` as const)}</span>{" "}
                    <Pill tone={rec.granted ? "positive" : "negative"}>
                      {rec.granted ? t("granted") : t("denied")}
                    </Pill>
                    <p className="mt-0.5 text-muted">
                      {t("basis", { basis: rec.basis })} · {t("origin", { origin: rec.origin })}
                    </p>
                  </li>
                );
              })}
            </ul>
          ))}
      </div>

      {!erased && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <Button
            size="sm"
            onClick={() => {
              seedTwinReply(projectId, contact, contact.notes ?? "");
              router.push(schrankaHref(projectId));
            }}
          >
            {t("reply")}
          </Button>
          <LeadStageControl current={contact.stage} disabled={!live} onChange={onStageChange} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-navy-800">{value}</dd>
    </div>
  );
}
