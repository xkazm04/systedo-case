"use client";

/** Napojení — where lead data actually comes in from.
 *
 *  Two rows do something today (manual entry, CSV import); four are registered but
 *  unbuilt. Those four are rendered WITH their caveat text visible, not behind a
 *  "coming soon" word and a tooltip: the WhatsApp number-registration warning and
 *  the LinkedIn "no inbox API at any price" note are exactly the facts that ambush
 *  an operator after they have committed, and the registry ships them in cs+en for
 *  this reason. Nothing here is connectable that cannot work — the ingest API
 *  answers an unimplemented connector with a 501 rather than degrading it. */
import { useRef, useState } from "react";
import Link from "next/link";
import { Button, Pill } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { ConnectorMeta } from "@/lib/leads/connectors/types";

const T = {
  cs: {
    lead: "Odkud přicházejí leady. Co dnes funguje je nahoře; u ostatních je napsáno, co je blokuje — přečtěte si to dřív, než na kanál vsadíte.",
    ready: "Funguje", soon: "Připravujeme",
    importTitle: "Import CSV",
    importHint: "Sloupce: jméno, e-mail, telefon, firma, zdroj, fáze, datum, poznámka. Oddělovač čárka i středník. Opakovaný import stejného souboru nic nezduplikuje.",
    pick: "Vybrat soubor",
    run: "Naimportovat",
    running: "Importuji…",
    result: "Hotovo: {applied} přidáno, {duplicates} duplicit, {rejected} odmítnuto.",
    failed: "Import se nezdařil. Zkontrolujte formát souboru.",
    manualHint: "Kontakt zadáte ručně v modulu Leady tlačítkem „Nový kontakt“.",
    openLeads: "Otevřít Leady",
    modes: "Režim: {modes}",
    fileTooBig: "Soubor je příliš velký (limit {mb} MB).",
  },
  en: {
    lead: "Where leads come in from. What works today is at the top; for the rest, what blocks them is written out — read it before betting on that channel.",
    ready: "Works", soon: "Coming soon",
    importTitle: "CSV import",
    importHint: "Columns: name, email, phone, company, source, stage, date, note. Comma or semicolon delimited. Re-importing the same file duplicates nothing.",
    pick: "Choose a file",
    run: "Import",
    running: "Importing…",
    result: "Done: {applied} added, {duplicates} duplicates, {rejected} rejected.",
    failed: "The import failed. Check the file's format.",
    manualHint: "Enter a contact by hand in the Leads module via “New contact”.",
    openLeads: "Open Leads",
    modes: "Mode: {modes}",
    fileTooBig: "That file is too large (limit {mb} MB).",
  },
} as const;

const MAX_BYTES = 512_000;

interface ImportResult {
  applied: number;
  duplicates: number;
  rejected: number;
}

export default function LeadConnectors({
  projectId,
  metas,
  locale,
}: {
  projectId: string;
  metas: ConnectorMeta[];
  locale: "cs" | "en";
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(t("fileTooBig", { mb: Math.round(MAX_BYTES / 1000) / 1000 }));
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/crm/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectorId: "csv", text }),
      });
      const json = (await res.json()) as { ok?: boolean } & Partial<ImportResult>;
      if (!res.ok || json.ok === false) throw new Error("import-failed");
      setResult({
        applied: json.applied ?? 0,
        duplicates: json.duplicates ?? 0,
        rejected: json.rejected ?? 0,
      });
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const label = (m: ConnectorMeta) => (locale === "en" ? m.labelEn : m.label);
  const caveat = (m: ConnectorMeta) => (locale === "en" ? (m.caveatEn ?? m.caveat) : m.caveat);

  return (
    <div className="stagger space-y-6">
      <p className="max-w-2xl text-sm leading-relaxed text-muted">{t("lead")}</p>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-navy-800">{t("importTitle")}</h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{t("importHint")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            aria-label={t("pick")}
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="text-xs text-muted file:mr-3 file:rounded-pill file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-navy-700"
          />
          <Button size="sm" onClick={runImport} disabled={!fileName || busy}>
            {busy ? t("running") : t("run")}
          </Button>
        </div>
        {result && (
          <p className="mt-2 text-xs text-positive">
            {t("result", {
              applied: fmt.fmtInt(result.applied),
              duplicates: fmt.fmtInt(result.duplicates),
              rejected: fmt.fmtInt(result.rejected),
            })}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-negative">{error}</p>}
        <p className="mt-3 text-xs text-muted">
          {t("manualHint")}{" "}
          <Link
            href={`/app/${projectId}/leady`}
            className="font-medium text-brand-accent underline-offset-2 hover:underline"
          >
            {t("openLeads")} →
          </Link>
        </p>
      </div>

      <ul className="card divide-y divide-line">
        {metas.map((m) => (
          <li key={m.id} className="flex flex-col gap-1.5 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-navy-800">{label(m)}</span>
              <Pill tone={m.implemented ? "positive" : "neutral"}>
                {m.implemented ? t("ready") : t("soon")}
              </Pill>
              <span className="text-xs text-muted">{t("modes", { modes: m.modes.join(" · ") })}</span>
            </div>
            {caveat(m) && <p className="max-w-3xl text-xs leading-relaxed text-muted">{caveat(m)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
