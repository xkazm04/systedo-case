"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Check, Document } from "@/components/icons";
import { useT, useFormatters } from "@/lib/i18n/client";
import { useOptionalProject } from "@/lib/projects/context";
import { useAsyncAction } from "@/components/hooks/useAsyncAction";
import {
  REPORT_CADENCES,
  REPORT_CADENCE_LABELS,
  type ReportCadence,
  type ReportConfig,
} from "@/lib/campaigns/report-config-types";
import type { BreakEven } from "@/lib/cost-model/compute";

const T = {
  cs: {
    summaryHeading: "Automatický report pro klienta",
    cadenceOff: "vypnuto",
    profileHeading: "Profil klienta",
    profileHint: "Ukotvuje AI report (kdo je klient) a je jediným cílem PNO pro report i anomálie.",
    clientNameLabel: "Název klienta",
    clientDomainLabel: "Doména",
    clientBusinessLabel: "Čím se klient zabývá (jedna věta)",
    clientBusinessPlaceholder: "e-shop s ořechy, semínky a superpotravinami",
    pnoGoalLabel: "Cílové PNO (%)",
    breakEvenHint: "Váš break-even PNO podle marže je {pno} (ROAS {roas}).",
    useAsGoal: "Použít jako cíl",
    brandLabel: "Název značky (white-label)",
    accentLabel: "Akcentová barva",
    accentAriaLabel: "Akcentová barva",
    recipientsLabel: "Příjemci (e-maily oddělené čárkou)",
    recipientsHint: "Prázdné = pošle se vlastníkovi účtu.",
    recipientsPlaceholder: "klient@firma.cz, account@agentura.cz",
    frequencyLabel: "Frekvence",
    saving: "Ukládám…",
    save: "Uložit nastavení",
    saved: "Uloženo",
    footnote:
      "Automatické odesílání běží pro připojené živé účty. Report se vytvoří z posledního" +
      " vyhodnocení portfolia; pokud žádné není, odeslání se přeskočí.",
    errorSave: "Uložení se nezdařilo.",
    errorServer: "Nepodařilo se spojit se serverem.",
  },
  en: {
    summaryHeading: "Automated client report",
    cadenceOff: "off",
    profileHeading: "Client profile",
    profileHint: "Grounds the AI report (who the client is) and is the single PNO target for both the report and anomalies.",
    clientNameLabel: "Client name",
    clientDomainLabel: "Domain",
    clientBusinessLabel: "What the client does (one line)",
    clientBusinessPlaceholder: "online store for nuts, seeds and superfoods",
    pnoGoalLabel: "Target PNO (%)",
    breakEvenHint: "Your margin-based break-even PNO is {pno} (ROAS {roas}).",
    useAsGoal: "Use as goal",
    brandLabel: "Brand name (white-label)",
    accentLabel: "Accent colour",
    accentAriaLabel: "Accent colour",
    recipientsLabel: "Recipients (comma-separated emails)",
    recipientsHint: "Leave empty to send to the account owner.",
    recipientsPlaceholder: "client@company.com, account@agency.com",
    frequencyLabel: "Frequency",
    saving: "Saving…",
    save: "Save settings",
    saved: "Saved",
    footnote:
      "Automatic sending runs for connected live accounts. The report is built from the latest" +
      " portfolio evaluation; if none exists the send is skipped.",
    errorSave: "Save failed.",
    errorServer: "Could not reach the server.",
  },
} as const;

/** White-label + scheduling settings for the client report. Branding stamps the
 *  shared report page; cadence + recipients drive the daily report cron. Renders
 *  nothing for anonymous visitors. */
export default function ReportSettings({ breakEven = null }: { breakEven?: BreakEven | null } = {}) {
  const { status } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const [cfg, setCfg] = useState<ReportConfig | null>(null);
  const { busy: saving, error, setError, run } = useAsyncAction();
  const [saved, setSaved] = useState(false);
  const t = useT(T);
  const fmt = useFormatters();

  const load = useCallback(async () => {
    try {
      const res = await fetch(pid ? `/api/campaigns/report-config?projectId=${encodeURIComponent(pid)}` : "/api/campaigns/report-config");
      if (!res.ok) return;
      setCfg((await res.json()) as ReportConfig);
    } catch {
      /* non-critical */
    }
  }, [pid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load]);

  if (status !== "authenticated" || !cfg) return null;

  const set = <K extends keyof ReportConfig>(key: K, value: ReportConfig[K]) => {
    setCfg((c) => (c ? { ...c, [key]: value } : c));
    setSaved(false);
  };

  const setProfile = <K extends keyof ReportConfig["clientProfile"]>(
    key: K,
    value: ReportConfig["clientProfile"][K]
  ) => {
    setCfg((c) => (c ? { ...c, clientProfile: { ...c.clientProfile, [key]: value } } : c));
    setSaved(false);
  };

  const save = () => {
    if (!cfg) return;
    const c = cfg;
    return run(
      async () => {
        const res = await fetch("/api/campaigns/report-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandName: c.brandName,
            accentColor: c.accentColor,
            recipients: c.recipients,
            cadence: c.cadence,
            clientProfile: c.clientProfile,
            projectId: pid,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json?.error ?? t("errorSave"));
          return;
        }
        setCfg(json as ReportConfig);
        setSaved(true);
      },
      { serverError: t("errorServer") }
    );
  };

  return (
    <details className="card p-5 sm:p-6">
      <summary className="flex cursor-pointer items-center gap-2 text-base font-semibold text-navy-800">
        <Document width={18} height={18} className="text-brand-600" />
        {t("summaryHeading")}
        <span className="ml-auto text-xs font-normal text-muted">
          {cfg.cadence === "off" ? t("cadenceOff") : REPORT_CADENCE_LABELS[cfg.cadence]}
        </span>
      </summary>

      {/* client profile — the single source for prompt identity + PNO goal */}
      <fieldset className="mt-5 rounded-card border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-navy-800">{t("profileHeading")}</legend>
        <p className="text-xs text-muted">{t("profileHint")}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("clientNameLabel")}</span>
            <input
              type="text"
              value={cfg.clientProfile.name}
              onChange={(e) => setProfile("name", e.target.value)}
              placeholder="Mionelo"
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("clientDomainLabel")}</span>
            <input
              type="text"
              value={cfg.clientProfile.domain}
              onChange={(e) => setProfile("domain", e.target.value)}
              placeholder="mionelo.cz"
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("clientBusinessLabel")}</span>
            <input
              type="text"
              value={cfg.clientProfile.businessLine}
              onChange={(e) => setProfile("businessLine", e.target.value)}
              placeholder={t("clientBusinessPlaceholder")}
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("pnoGoalLabel")}</span>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={Math.round(cfg.clientProfile.pnoGoal * 100)}
              onChange={(e) => {
                const pct = Number(e.target.value);
                if (Number.isFinite(pct) && pct > 0) setProfile("pnoGoal", pct / 100);
              }}
              className="tnum w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
            {/* Direction 2: the margin-derived break-even PNO as CONTEXT beside the
                target, plus an explicit action to adopt it — never automatic, so a
                negotiated client target is never silently overwritten. Only when a
                cost model exists (breakEven passed) and its PNO is finite. */}
            {breakEven && Number.isFinite(breakEven.grossPno) && (
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span>
                  {t("breakEvenHint", {
                    pno: fmt.fmtPct(breakEven.grossPno, 0),
                    roas: fmt.fmtMultiple(breakEven.grossRoas),
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => setProfile("pnoGoal", breakEven.grossPno)}
                  className="rounded-pill border border-brand-300 bg-brand-50 px-2.5 py-1 font-semibold text-brand-accent transition-colors hover:border-brand-400"
                >
                  {t("useAsGoal")}
                </button>
              </span>
            )}
          </label>
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("brandLabel")}</span>
          <input
            type="text"
            value={cfg.brandName}
            onChange={(e) => set("brandName", e.target.value)}
            placeholder="Adamant"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("accentLabel")}</span>
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={cfg.accentColor || "#0e9c97"}
              onChange={(e) => set("accentColor", e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface"
              aria-label={t("accentAriaLabel")}
            />
            <input
              type="text"
              value={cfg.accentColor}
              onChange={(e) => set("accentColor", e.target.value)}
              placeholder="#0e9c97"
              className="tnum w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">
            {t("recipientsLabel")}
          </span>
          <input
            type="text"
            value={cfg.recipients.join(", ")}
            onChange={(e) => set("recipients", e.target.value.split(/[\s,;]+/).filter(Boolean))}
            placeholder={t("recipientsPlaceholder")}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          />
          <span className="mt-1 block text-xs text-muted">{t("recipientsHint")}</span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("frequencyLabel")}</span>
          <select
            value={cfg.cadence}
            onChange={(e) => set("cadence", e.target.value as ReportCadence)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          >
            {REPORT_CADENCES.map((c) => (
              <option key={c} value={c}>
                {REPORT_CADENCE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-pill bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
        >
          {saving ? t("saving") : t("save")}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-positive">
            <Check width={15} height={15} />
            {t("saved")}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">{t("footnote")}</p>
    </details>
  );
}
