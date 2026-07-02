"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui";
import { useLocale } from "@/lib/i18n/LocaleProvider";

/** Route error boundary: catches render/data errors from any page and shows a
 *  branded, localized retry screen instead of the framework's unstyled
 *  "Application error". It renders INSIDE the root layout (nav + footer stay
 *  up, LocaleProvider is available), so a transient Firestore/Ads hiccup stays
 *  a recoverable non-event. Must be a client component per the Next.js
 *  error-file contract. */

const T = {
  cs: {
    eyebrow: "Neočekávaná chyba",
    heading: "Něco se pokazilo",
    body: "Omlouváme se — při vykreslování stránky nastala neočekávaná chyba. Většinou jde o přechodný výpadek; zkuste to prosím znovu.",
    digest: "Kód chyby",
    retry: "Zkusit znovu",
    home: "Zpět na přehled",
  },
  en: {
    eyebrow: "Unexpected error",
    heading: "Something went wrong",
    body: "Sorry — an unexpected error occurred while rendering this page. It is usually a transient hiccup; please try again.",
    digest: "Error code",
    retry: "Try again",
    home: "Back to overview",
  },
} as const;

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useLocale();
  const t = T[locale] ?? T.cs;

  useEffect(() => {
    // Surface the client-side error for observability; the server log carries
    // the digest twin, so the visible code below is enough to correlate them.
    console.error("[root error boundary]", error);
  }, [error]);

  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-2xl">
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-navy-800 sm:text-4xl">
          {t.heading}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">{t.body}</p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted">
            {t.digest}: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.99]"
          >
            {t.retry}
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-pill border border-line px-5 py-2.5 text-sm font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-accent"
          >
            {t.home}
          </Link>
        </div>
      </div>
    </Container>
  );
}
