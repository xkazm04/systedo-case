"use client";

/** Error boundary for the authed module pages. Renders inside ProjectLayout
 *  (the app shell / sidebar stays), so a module throw shows a branded, retryable
 *  card instead of an unstyled 500 — the user keeps their navigation. */
import { useEffect } from "react";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    title: "Modul se nepodařilo načíst",
    body: "Při načítání tohoto modulu došlo k chybě. Vaše data jsou v pořádku.",
    retry: "Zkusit znovu",
  },
  en: {
    title: "This module failed to load",
    body: "Something went wrong loading this module. Your data is safe.",
    retry: "Try again",
  },
} as const;

export default function ModuleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT(T);
  useEffect(() => {
    console.error("[module error boundary]", error);
  }, [error]);

  return (
    <div className="p-6 sm:p-8">
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-3 text-sm text-muted">{t("body")}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.99]"
        >
          {t("retry")}
        </button>
      </div>
    </div>
  );
}
