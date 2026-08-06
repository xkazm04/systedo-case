"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { External, Check, Layers } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { useOptionalProject } from "@/lib/projects/context";
import { useAsyncAction } from "@/components/hooks/useAsyncAction";
import type { MicrositeConfig } from "@/lib/microsite";
import { resolveMicrositeIdentity } from "@/lib/microsite-identity";
import type { ReportConfig } from "@/lib/campaigns/report-config-types";

const T = {
  cs: {
    heading: "Klientský microsite",
    subtitle:
      "Veřejná, vyhledávači indexovatelná stránka s výkonem klienta na stálé adrese, vždy aktuální" +
      " z posledního snímku, ve vašich barvách.",
    brandLabel: "Značka klienta",
    brandSourceHint:
      "Název i akcent se přebírají z Automatického reportu pro klienta výše (Profil klienta). Spravujete je na jednom místě.",
    periodLabel: "Období",
    publishing: "Publikuji…",
    publish: "Publikovat microsite",
    takeOffline: "Vypnout microsite",
    period30: "30 dní",
    period90: "90 dní",
    period365: "12 měsíců",
    errorPublish: "Publikování se nezdařilo.",
    errorServer: "Nepodařilo se spojit se serverem.",
  },
  en: {
    heading: "Client microsite",
    subtitle:
      "A public, search-indexable page showing client performance at a permanent URL, always" +
      " up to date from the latest snapshot, in your brand colors.",
    brandLabel: "Client brand",
    brandSourceHint:
      "Name and accent are taken from the Automated client report above (Client profile), managed in one place.",
    periodLabel: "Period",
    publishing: "Publishing…",
    publish: "Publish microsite",
    takeOffline: "Take microsite offline",
    period30: "30 days",
    period90: "90 days",
    period365: "12 months",
    errorPublish: "Publishing failed.",
    errorServer: "Could not reach the server.",
  },
} as const;

/** Publish a white-label, SEO-indexable client microsite at /m/{slug} that
 *  re-renders from the latest snapshot. Brand identity (client/brand name +
 *  accent) is NOT collected here — it is read from the report config (the single
 *  white-label source), so there is one color picker and one client-name field in
 *  the whole page. This card keeps only microsite-specific controls (period,
 *  publish/unpublish, the slug/link). Anonymous → hidden. */
export default function MicrositeCard() {
  const { status } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const [site, setSite] = useState<MicrositeConfig | null>(null);
  const [reportCfg, setReportCfg] = useState<ReportConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [periodDays, setPeriodDays] = useState(30);
  const { busy, error, setError, run } = useAsyncAction();
  const [origin, setOrigin] = useState("");
  const t = useT(T);

  const PERIODS = [
    { days: 30, label: t("period30") },
    { days: 90, label: t("period90") },
    { days: 365, label: t("period365") },
  ];

  const load = useCallback(async () => {
    try {
      const qs = pid ? `?projectId=${encodeURIComponent(pid)}` : "";
      // Load the microsite and the report config together: the card previews the
      // white-label identity the server will resolve at publish, using the same
      // pure fallback (persisted site → report config → default).
      const [mRes, rRes] = await Promise.all([
        fetch(`/api/microsite${qs}`),
        fetch(`/api/campaigns/report-config${qs}`),
      ]);
      if (mRes.ok) {
        const json = (await mRes.json()) as { microsite?: MicrositeConfig | null };
        setSite(json.microsite ?? null);
      }
      if (rRes.ok) setReportCfg((await rRes.json()) as ReportConfig);
    } catch {
      /* non-critical */
    } finally {
      setLoaded(true);
    }
  }, [pid]);

  useEffect(() => {
    // Set after mount (not during render) so SSR ("") and first client paint
    // agree — avoids a hydration mismatch on the displayed absolute URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    if (status === "authenticated") void load();
  }, [status, load]);

  // Preview the identity the server will publish with — mirrors the route's
  // resolution order exactly (own persisted site wins, then report config, then
  // the demo default).
  const identity = resolveMicrositeIdentity(
    site ?? undefined,
    reportCfg
      ? {
          clientName: reportCfg.clientProfile.name,
          accentColor: reportCfg.accentColor,
          brandName: reportCfg.brandName,
        }
      : undefined
  );

  const publish = () =>
    run(
      async () => {
        // Identity is resolved server-side from the report config; only the
        // microsite-specific period travels with the request.
        const res = await fetch("/api/microsite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodDays, projectId: pid }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? t("errorPublish"));
          return;
        }
        setSite(json.microsite as MicrositeConfig);
      },
      { serverError: t("errorServer") }
    );

  // No serverError → the network catch stays silent, matching the original
  // "take offline" handler that swallowed fetch failures.
  const takeOffline = () =>
    run(async () => {
      await fetch(pid ? `/api/microsite?projectId=${encodeURIComponent(pid)}` : "/api/microsite", {
        method: "DELETE",
      });
      setSite(null);
    });

  if (status !== "authenticated" || !loaded) return null;

  const url = site ? `${origin}/m/${site.slug}` : "";

  return (
    <section className="card p-6">
      <div className="flex items-center gap-2">
        <Layers width={16} height={16} className="text-brand-accent" />
        <h2 className="text-base font-semibold text-navy-800">{t("heading")}</h2>
      </div>
      <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>

      {site ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-positive/30 bg-positive-soft/40 px-3 py-2.5 text-sm">
            <Check width={15} height={15} className="text-positive" />
            <span className="font-medium text-navy-800">{site.clientName}</span>
            <a
              href={`/m/${site.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand-accent hover:underline"
            >
              {url || `/m/${site.slug}`}
              <External width={13} height={13} />
            </a>
          </div>
          <button
            type="button"
            onClick={takeOffline}
            disabled={busy}
            className="text-xs font-medium text-negative hover:underline disabled:opacity-60"
          >
            {t("takeOffline")}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            {/* white-label identity — read-only preview, resolved from the report
                config (edited once, above). No duplicate name / colour inputs. */}
            <div>
              <span className="text-xs font-medium text-muted">{t("brandLabel")}</span>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-line"
                  style={{ backgroundColor: identity.accentColor }}
                  aria-hidden
                />
                <span className="font-medium text-navy-800">{identity.brandName}</span>
              </div>
            </div>
            <label className="text-xs font-medium text-muted">
              {t("periodLabel")}
              <select
                value={periodDays}
                onChange={(e) => setPeriodDays(Number(e.target.value))}
                className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800"
              >
                {PERIODS.map((p) => (
                  <option key={p.days} value={p.days}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted">{t("brandSourceHint")}</p>
          <button
            type="button"
            onClick={publish}
            disabled={busy}
            className="rounded-pill bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t("publishing") : t("publish")}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
    </section>
  );
}
