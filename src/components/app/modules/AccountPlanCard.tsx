"use client";

/** The plan card on Účet. The account page showed profile, security, sessions and
 *  GDPR but never once said what the user is paying for — the plan lived only in
 *  Firestore and on the public /cena page.
 *
 *  It is framed the way plans.ts's honesty comment demands: for the BYOM tier the
 *  headline is UNLIMITED generation delivered at runtime (a call served by the
 *  user's own key skips metering), and PLANS.byom.aiEval is disclosed for what it
 *  is — the app-funded fallback cap, not the plan's ceiling. No billing or upgrade
 *  flow is implied: there is none, so the card links to /cena and says so. */
import Link from "next/link";
import { Pill } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { PlanEntitlement } from "@/lib/plans";
import type { TDict } from "@/lib/i18n/interpolate";

type K =
  | "title" | "plan_free" | "plan_pro" | "plan_byom" | "priceFree" | "priceMonth"
  | "aiEval" | "sync" | "image" | "perDay" | "usedToday" | "unlimited"
  | "unlimitedNote" | "fallbackNote" | "devUnlock" | "noBilling" | "seePlans";

const T: TDict<K> = {
  cs: {
    title: "Plán",
    plan_free: "Free", plan_pro: "Pro", plan_byom: "Vlastní klíč",
    priceFree: "Zdarma", priceMonth: "{n} Kč / měsíc",
    aiEval: "AI vyhodnocení", sync: "Synchronizace Google Ads", image: "Generování vizuálů",
    perDay: "{n} / den", usedToday: "dnes využito {n}",
    unlimited: "Neomezeně přes vlastní klíč",
    unlimitedNote: "Generování přes váš vlastní klíč se nezapočítává — platíte tokeny přímo poskytovateli.",
    fallbackNote: "Když váš klíč chybí nebo selže, generuje se přes náš klíč — a ten je omezený na {n} / den.",
    devUnlock: "Vlastní klíč je teď odemčený vývojovým přepínačem, ne plánem.",
    noBilling: "Platby zatím nejsou v aplikaci zapojené; plán mění podpora.",
    seePlans: "Porovnat plány",
  },
  en: {
    title: "Plan",
    plan_free: "Free", plan_pro: "Pro", plan_byom: "Own key",
    priceFree: "Free", priceMonth: "{n} CZK / month",
    aiEval: "AI evaluations", sync: "Google Ads syncs", image: "Visual generations",
    perDay: "{n} / day", usedToday: "{n} used today",
    unlimited: "Unlimited via your own key",
    unlimitedNote: "Generation served by your own key is never metered — you pay tokens straight to the provider.",
    fallbackNote: "When your key is missing or failing, generation falls back to ours — and that path is capped at {n} / day.",
    devUnlock: "Own-key access is currently unlocked by a dev switch, not by your plan.",
    noBilling: "Billing is not wired in the app yet; support changes your plan.",
    seePlans: "Compare plans",
  },
};

export default function AccountPlanCard({ entitlement }: { entitlement: PlanEntitlement }) {
  const t = useT(T);
  const e = entitlement;
  const unlimited = e.aiAllowance === "unlimited-via-own-key";
  const planLabel = e.plan === "pro" ? t("plan_pro") : e.plan === "byom" ? t("plan_byom") : t("plan_free");

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-navy-800">{t("title")}</h3>
        <Pill tone={e.plan === "free" ? "neutral" : "brand"}>{planLabel}</Pill>
      </div>

      <p className="tnum text-2xl font-semibold text-navy-800">
        {e.priceCzk === 0 ? t("priceFree") : t("priceMonth", { n: e.priceCzk })}
      </p>

      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t("aiEval")}</dt>
            <dd className="text-right text-navy-800">
              {unlimited ? t("unlimited") : t("perDay", { n: e.limits.aiEval })}
            </dd>
          </div>
          {unlimited ? (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {t("unlimitedNote")} {t("fallbackNote", { n: e.limits.aiEval })}
            </p>
          ) : (
            <p className="tnum mt-1 text-xs text-muted">{t("usedToday", { n: e.used.aiEval })}</p>
          )}
        </div>
        <Allowance label={t("sync")} limit={t("perDay", { n: e.limits.sync })} used={t("usedToday", { n: e.used.sync })} />
        <Allowance label={t("image")} limit={t("perDay", { n: e.limits.image })} used={t("usedToday", { n: e.used.image })} />
      </dl>

      {/* The entitlement can be TRUE on a non-byom plan when the off-production dev
          switch is on. Saying so is the difference between an honest readout and a
          user believing they bought something they didn't. */}
      {e.byomActive && e.plan !== "byom" && (
        <p className="mt-4 rounded-lg bg-canvas px-4 py-3 text-xs text-muted">{t("devUnlock")}</p>
      )}

      <p className="mt-4 text-xs text-muted">{t("noBilling")}</p>
      <Link
        href="/cena"
        className="mt-1 inline-block text-sm font-semibold text-brand-accent hover:text-brand-800"
      >
        {t("seePlans")} →
      </Link>
    </div>
  );
}

function Allowance({ label, limit, used }: { label: string; limit: string; used: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">
        {label}
        <span className="tnum block text-xs">{used}</span>
      </dt>
      <dd className="tnum shrink-0 text-navy-800">{limit}</dd>
    </div>
  );
}
