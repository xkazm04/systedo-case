"use client";

/** Route-transition skeleton for the authed module segment. Shown (inside the
 *  app shell) while a force-dynamic module page computes its data, so navigating
 *  between modules no longer blocks on a blank screen with no feedback.
 *
 *  Client + synchronous on purpose: a Suspense fallback must not itself suspend,
 *  so it uses the sync useT hook rather than the async server getT. */
import { useT } from "@/lib/i18n/client";

const T = {
  cs: { loading: "Načítání…" },
  en: { loading: "Loading…" },
} as const;

export default function ModuleLoading() {
  const t = useT(T);
  return (
    <div className="p-6 sm:p-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <div className="animate-pulse space-y-6">
        <div className="space-y-3">
          <div className="h-7 w-64 max-w-full rounded-lg bg-line" />
          <div className="h-4 w-96 max-w-full rounded bg-line/70" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-28 p-5">
              <div className="h-3 w-20 rounded bg-line/70" />
              <div className="mt-4 h-7 w-24 rounded-lg bg-line" />
            </div>
          ))}
        </div>
        <div className="card h-64 p-6">
          <div className="h-4 w-40 rounded bg-line/70" />
          <div className="mt-6 h-40 w-full rounded-lg bg-line/60" />
        </div>
      </div>
    </div>
  );
}
