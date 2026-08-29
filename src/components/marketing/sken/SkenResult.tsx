"use client";

import { useMemo } from "react";
import type { OnboardingScanResult } from "@/lib/ai-types";
import { Button } from "@/components/ui";
import { baseChannelPlan } from "@/lib/organic-channels/sample";
import { coerceProjectType } from "@/lib/projects/types";
import { useT } from "@/lib/i18n/client";
import SkenProfileCard from "./SkenProfileCard";
import SkenPlanTable from "./SkenPlanTable";
import type { SkenClaimPhase } from "./useSkenClaim";

/** The answer: what the scan read, what to do with it, and the one offer.
 *
 *  The channel plan is derived here, on the client, with NO second provider call —
 *  `baseChannelPlan` is the module's curated catalog, seeded by the scanned URL so
 *  the same site always produces the same plan. One scan is one AI call (ADR-0003);
 *  everything below the profile card is deterministic. SkenPlanTable labels it. */
const T = {
  cs: {
    ctaHeading: "Uložit jako projekt",
    ctaBody:
      "Přihlášením si tenhle sken uložíte jako skutečný projekt: profil, konkurenti i klíčová slova se do něj rovnou nasypou, takže nezačínáte na prázdné aplikaci.",
    cta: "Přihlásit se a uložit",
    ctaSelfHost: "Přihlásit se heslem operátora a uložit",
    claiming: "Ukládám sken…",
    redeeming: "Zakládám projekt…",
    needsSignin: "Sken je uložený, ale nejste přihlášení. Dokončete přihlášení a projekt se založí.",
    retry: "Dokončit přihlášení",
    expired: "Odkaz na sken vypršel nebo už byl použit. Spusťte sken znovu a uložte ho.",
    failed: "Uložení se nepodařilo. Zkuste to prosím znovu.",
    trust: "Bez platební karty · projekt kdykoli smažete",
  },
  en: {
    ctaHeading: "Save as a project",
    ctaBody:
      "Sign in and this scan becomes a real project: the profile, the competitors and the keywords are seeded into it, so you do not start on an empty app.",
    cta: "Sign in and save",
    ctaSelfHost: "Sign in with the operator password and save",
    claiming: "Saving the scan…",
    redeeming: "Creating the project…",
    needsSignin: "The scan is saved, but you are not signed in. Finish signing in and the project is created.",
    retry: "Finish signing in",
    expired: "That scan link expired or was already used. Run the scan again and save it.",
    failed: "Saving failed. Please try again.",
    trust: "No payment card · delete the project anytime",
  },
} as const;

export default function SkenResult({
  result,
  scannedUrl,
  phase,
  selfHosted,
  onClaim,
  onRetrySignIn,
}: {
  result: OnboardingScanResult;
  scannedUrl: string;
  phase: SkenClaimPhase;
  selfHosted: boolean;
  onClaim: () => void;
  onRetrySignIn: () => void;
}) {
  const t = useT(T);
  const plan = useMemo(
    () =>
      baseChannelPlan(
        coerceProjectType(result.suggestedType),
        { brand: result.businessName || undefined, category: result.offering || undefined },
        scannedUrl || result.businessName || "sken"
      ),
    [result.suggestedType, result.businessName, result.offering, scannedUrl]
  );

  const busy = phase === "claiming" || phase === "redeeming";

  return (
    <div className="mt-10">
      <SkenProfileCard result={result} />
      <SkenPlanTable plan={plan} />

      <div className="mt-8 rounded-2xl border border-line bg-brand-50 p-6">
        <h3 className="text-lg font-semibold tracking-tight text-navy-800">{t("ctaHeading")}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-700">{t("ctaBody")}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {phase === "needs-signin" ? (
            <Button onClick={onRetrySignIn}>{t("retry")}</Button>
          ) : (
            <Button onClick={onClaim} disabled={busy}>
              {selfHosted ? t("ctaSelfHost") : t("cta")}
            </Button>
          )}
          <span className="text-xs text-muted">{t("trust")}</span>
        </div>

        {busy && (
          <p className="mt-3 text-sm text-muted" role="status">
            {phase === "claiming" ? t("claiming") : t("redeeming")}
          </p>
        )}
        {phase === "needs-signin" && <p className="mt-3 text-sm text-navy-700">{t("needsSignin")}</p>}
        {phase === "expired" && <p className="mt-3 text-sm text-coral-600">{t("expired")}</p>}
        {phase === "failed" && <p className="mt-3 text-sm text-coral-600">{t("failed")}</p>}
      </div>
    </div>
  );
}
