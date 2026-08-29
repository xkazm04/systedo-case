"use client";

import type { OnboardingScanResult } from "@/lib/ai-types";
import { Pill } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** What the model read off the page, shown as fields rather than prose — so a
 *  visitor can check each claim against their own site instead of judging a
 *  paragraph as a whole.
 *
 *  Two disclosures are load-bearing here:
 *   - `source: "fallback"` means NO model ran: the profile was derived
 *     deterministically from the domain and the page's own title/description. It
 *     is a starter, not a read, and it says so — the alternative (letting it pass
 *     as AI output) is the exact failure the provenance marker exists to prevent.
 *   - competitors are SUGGESTIONS. The scan reads one page; it cannot verify that
 *     these companies compete with anyone. */
const T = {
  cs: {
    heading: "Co sken přečetl",
    fallbackBadge: "Základní profil bez AI",
    fallbackNote:
      "Na tomhle prostředí není připojený model, takže profil vznikl z adresy a z titulku a popisku stránky — ne z jejího obsahu. V aplikaci s připojeným modelem dostanete plný sken.",
    labelSummary: "Shrnutí",
    labelOffering: "Nabídka",
    labelAudience: "Publikum",
    labelTone: "Tón",
    labelKeywords: "Klíčová slova",
    labelCompetitors: "Konkurenti (návrh)",
    competitorsNote: "Návrhy modelu, neověřené — v aplikaci je potvrzujete vy, než se dostanou do podkladů.",
    empty: "—",
  },
  en: {
    heading: "What the scan read",
    fallbackBadge: "Basic profile, no AI",
    fallbackNote:
      "No model is connected on this environment, so the profile was derived from the address and the page's title and description — not from its content. Connect a model in the app for a full scan.",
    labelSummary: "Summary",
    labelOffering: "Offering",
    labelAudience: "Audience",
    labelTone: "Voice",
    labelKeywords: "Keywords",
    labelCompetitors: "Competitors (suggested)",
    competitorsNote: "Model suggestions, unverified — inside the app you confirm them before they ground anything.",
    empty: "—",
  },
} as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line py-3 first:border-t-0 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted sm:pt-0.5">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-navy-700 sm:mt-0">{value}</dd>
    </div>
  );
}

export default function SkenProfileCard({ result }: { result: OnboardingScanResult }) {
  const t = useT(T);
  const dash = t("empty");
  const isFallback = result.source === "fallback";

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-navy-800">
          {result.businessName || t("heading")}
        </h2>
        {isFallback && <Pill tone="navy">{t("fallbackBadge")}</Pill>}
      </div>
      {isFallback && <p className="mt-3 text-xs leading-relaxed text-muted">{t("fallbackNote")}</p>}

      <dl className="mt-5">
        <Field label={t("labelSummary")} value={result.summary || dash} />
        <Field label={t("labelOffering")} value={result.offering || dash} />
        <Field label={t("labelAudience")} value={result.audience || dash} />
        <Field label={t("labelTone")} value={result.toneOfVoice || dash} />
        <Field label={t("labelKeywords")} value={result.keywords.join(" · ") || dash} />
        <Field label={t("labelCompetitors")} value={result.competitors.join(" · ") || dash} />
      </dl>

      {result.competitors.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-muted">{t("competitorsNote")}</p>
      )}
    </div>
  );
}
