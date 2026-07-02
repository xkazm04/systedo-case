"use client";

/** Root error boundary for the marketing/public tree. Renders inside the root
 *  layout (Nav/Footer + locale context intact), so a thrown render error shows
 *  branded chrome and a retry instead of Next's unstyled default. */
import { useEffect } from "react";
import Link from "next/link";
import { Container } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    title: "Něco se pokazilo",
    body: "Na této stránce došlo k neočekávané chybě. Zkuste to prosím znovu.",
    retry: "Zkusit znovu",
    home: "Zpět na úvod",
  },
  en: {
    title: "Something went wrong",
    body: "This page hit an unexpected error. Please try again.",
    retry: "Try again",
    home: "Back home",
  },
} as const;

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT(T);
  useEffect(() => {
    console.error("[root error boundary]", error);
  }, [error]);

  return (
    <Container className="py-24">
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-3 text-sm text-muted">{t("body")}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.99]"
          >
            {t("retry")}
          </button>
          <Link
            href="/"
            className="rounded-pill border border-line px-5 py-2.5 text-sm font-medium text-navy-700 hover:border-brand-300"
          >
            {t("home")}
          </Link>
        </div>
      </div>
    </Container>
  );
}
