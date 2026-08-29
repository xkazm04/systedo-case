"use client";

import { useState } from "react";
import type { OnboardingScanResult } from "@/lib/ai-types";
import { Button, Container } from "@/components/ui";
import { useAiTool } from "@/components/ai/useAiTool";
import { useT } from "@/lib/i18n/client";
import SkenResult from "./SkenResult";
import { useSkenClaim } from "./useSkenClaim";

/** The interactive half of /sken: one input, one AI call, one offer.
 *
 *  It rides the normal chokepoint — `useAiTool` posts to /api/ai like every other
 *  tool in the app — on the `onboarding-scan-public` mode, whose only difference
 *  from the authed `onboarding-scan` is the guard: instead of a 401 for anonymous
 *  callers, a per-IP daily cap. So the 429 handling, the abort ceiling and the
 *  typed error envelope all come for free, including the retry countdown a rate
 *  limit produces. No project context exists here, and none is sent. */
const T = {
  cs: {
    label: "Adresa vašeho webu",
    placeholder: "napriklad-vase-firma.cz",
    submit: "Naskenovat web",
    scanning: "Skenuji web…",
    scanningNote: "Stahuji úvodní stránku a čtu ji. Obvykle to trvá do minuty.",
    retryIn: "Zkuste to prosím za {n} s.",
    again: "Skenovat jinou adresu",
    redeeming: "Zakládám projekt z uloženého skenu…",
    needsSignin: "Sken máme uložený, ale nejste přihlášení. Dokončete přihlášení a projekt se založí.",
    retry: "Dokončit přihlášení",
    expired: "Odkaz na sken vypršel nebo už byl použit. Spusťte sken znovu.",
    failed: "Projekt se nepodařilo založit. Zkuste sken spustit znovu.",
  },
  en: {
    label: "Your website address",
    placeholder: "example-your-company.com",
    submit: "Scan the site",
    scanning: "Scanning the site…",
    scanningNote: "Fetching the homepage and reading it. Usually under a minute.",
    retryIn: "Please try again in {n} s.",
    again: "Scan a different address",
    redeeming: "Creating the project from your saved scan…",
    needsSignin: "The scan is saved, but you are not signed in. Finish signing in and the project is created.",
    retry: "Finish signing in",
    expired: "That scan link expired or was already used. Run the scan again.",
    failed: "The project could not be created. Try running the scan again.",
  },
} as const;

/** Which line the returning-from-sign-in banner shows, or null when there is
 *  nothing to say (idle / claiming — the form itself is the story then). */
const RETURN_MESSAGE = {
  redeeming: "redeeming",
  "needs-signin": "needsSignin",
  expired: "expired",
  failed: "failed",
} as const;

export default function SkenClient({
  claimToken,
  selfHosted = false,
}: {
  claimToken?: string;
  selfHosted?: boolean;
}) {
  const t = useT(T);
  const [url, setUrl] = useState("");
  /** The address the CURRENT result was produced from — the result outlives edits
   *  to the input, and the claim must record what was actually scanned. */
  const [scannedUrl, setScannedUrl] = useState("");
  const scan = useAiTool<OnboardingScanResult>("onboarding-scan-public");
  const { phase, claim, retrySignIn } = useSkenClaim({ claimToken, selfHosted });

  const result = scan.status === "done" ? scan.data?.result : undefined;
  const busy = scan.status === "loading";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!value || busy) return;
    setScannedUrl(value);
    void scan.run({ url: value });
  }

  // The return leg of a claim (see useSkenClaim). Rendered above the form because
  // when the visitor comes back from the provider there is no scan on screen yet —
  // without this, a redeem that fails would look like an ordinary empty page.
  const returnKey = claimToken ? RETURN_MESSAGE[phase as keyof typeof RETURN_MESSAGE] : undefined;

  return (
    <section className="border-b border-line">
      <Container className="py-12 lg:py-16">
        {returnKey && !result && (
          <div className="mb-8 max-w-2xl rounded-2xl border border-line bg-surface p-5 shadow-card" role="status">
            <p className="text-sm leading-relaxed text-navy-700">{t(returnKey)}</p>
            {phase === "needs-signin" && (
              <Button className="mt-4" onClick={retrySignIn}>
                {t("retry")}
              </Button>
            )}
          </div>
        )}

        <form onSubmit={submit} className="max-w-2xl">
          <label htmlFor="sken-url" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {t("label")}
          </label>
          <div className="mt-2 flex flex-wrap gap-3">
            <input
              id="sken-url"
              type="text"
              inputMode="url"
              autoComplete="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("placeholder")}
              disabled={busy}
              className="min-w-0 flex-1 rounded-pill border border-line bg-surface px-5 py-3 text-sm text-ink outline-none transition-colors focus:border-brand-accent disabled:opacity-60"
            />
            <Button type="submit" disabled={busy || url.trim().length === 0}>
              {busy ? t("scanning") : result ? t("again") : t("submit")}
            </Button>
          </div>
        </form>

        {busy && (
          <p className="mt-4 text-sm text-muted" role="status">
            {t("scanningNote")}
          </p>
        )}

        {scan.status === "error" && scan.error && (
          <p className="mt-4 max-w-2xl text-sm text-coral-600" role="alert">
            {scan.error}
            {scan.retryIn !== null && scan.retryIn > 0 ? ` ${t("retryIn", { n: scan.retryIn })}` : ""}
          </p>
        )}

        {result && (
          <SkenResult
            result={result}
            scannedUrl={scannedUrl}
            phase={phase}
            selfHosted={selfHosted}
            onClaim={() => void claim(result, scannedUrl)}
            onRetrySignIn={retrySignIn}
          />
        )}
      </Container>
    </section>
  );
}
