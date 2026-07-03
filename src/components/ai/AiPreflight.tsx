"use client";

/** Preflight banner for the AI tool panels: warns BEFORE a user fills a form
 *  and burns a request that the answer would be canned demo output (no provider
 *  configured) or that today's generation budget is spent/nearly spent. Driven
 *  by the shared GET /api/ai/status fetch; renders nothing while the status is
 *  loading, unavailable, or unremarkable (live provider + plenty of budget). */
import Link from "next/link";
import { Info } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { preflightNotice } from "@/lib/ai/status-core";
import { useAiStatus } from "./useAiStatus";

const T = {
  cs: {
    demoTitle: "Poběží ukázkový režim",
    demoBody:
      "Není nakonfigurován žádný AI poskytovatel — výstupy budou předpřipravené ukázky, ne skutečné generování.",
    degradedTitle: "AI poskytovatel může mít výpadek",
    degradedBody:
      "Většina nedávných generování skončila v ukázkovém režimu — výstup nemusí být skutečné generování.",
    exhaustedTitle: "Dnešní limit AI generování je vyčerpán",
    exhaustedBodyIp: "Zkuste to prosím znovu zítra.",
    exhaustedBodyPlan: "Zkuste to zítra, nebo přejděte na vyšší plán.",
    lowRemaining: "Zbývá {n} generování dnes.",
    upgradeCta: "Přejít na ceník",
    providerAvailable: "dostupný",
    providerUnavailable: "nedostupný",
  },
  en: {
    demoTitle: "Demo mode ahead",
    demoBody:
      "No AI provider is configured — outputs will be canned demo samples, not a real generation.",
    degradedTitle: "The AI provider may be down",
    degradedBody:
      "Most recent generations ended up in demo mode — the output may not be a real generation.",
    exhaustedTitle: "Today's AI generation limit is spent",
    exhaustedBodyIp: "Please try again tomorrow.",
    exhaustedBodyPlan: "Try again tomorrow, or upgrade your plan.",
    lowRemaining: "{n} generations left today.",
    upgradeCta: "See pricing",
    providerAvailable: "available",
    providerUnavailable: "unavailable",
  },
} as const;

export default function AiPreflight() {
  const t = useT(T);
  const status = useAiStatus();
  if (!status) return null;
  const notice = preflightNotice(status);
  if (!notice.kind) return null;

  if (notice.kind === "low") {
    return (
      <p role="status" className="mt-4 flex items-center gap-1.5 text-xs text-muted">
        <Info width={13} height={13} className="shrink-0" />
        {t("lowRemaining", { n: notice.remaining })}
      </p>
    );
  }

  // demo/degraded warn in coral (canned output ahead); a spent budget is negative.
  const warn = notice.kind === "demo" || notice.kind === "degraded";
  const title =
    notice.kind === "demo"
      ? t("demoTitle")
      : notice.kind === "degraded"
        ? t("degradedTitle")
        : t("exhaustedTitle");
  const body =
    notice.kind === "demo"
      ? t("demoBody")
      : notice.kind === "degraded"
        ? t("degradedBody")
        : notice.metered
          ? t("exhaustedBodyPlan")
          : t("exhaustedBodyIp");
  return (
    <div
      role="status"
      data-testid="ai-preflight"
      className={`mt-4 flex items-start gap-2.5 rounded-card border px-4 py-3 ${
        warn ? "border-coral-500/30 bg-coral-soft" : "border-negative/30 bg-negative-soft"
      }`}
    >
      <Info
        width={16}
        height={16}
        className={`mt-0.5 shrink-0 ${warn ? "text-coral-600" : "text-negative"}`}
      />
      <div className="min-w-0 text-sm">
        <p className={`font-semibold ${warn ? "text-coral-600" : "text-negative"}`}>{title}</p>
        <p className="mt-0.5 text-muted">
          {body}
          {notice.kind === "exhausted" && notice.metered && (
            <>
              {" "}
              <Link href="/cena" className="font-medium text-brand-accent hover:text-brand-800">
                {t("upgradeCta")}
              </Link>
            </>
          )}
        </p>
        {/* The one-line "why": per-provider availability as the wrapper sees it. */}
        {warn && status.providers.length > 0 && (
          <p className="mt-1 text-xs text-muted">
            {status.providers
              .map(
                (p) =>
                  `${p.model} — ${p.available ? t("providerAvailable") : t("providerUnavailable")}`
              )
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
