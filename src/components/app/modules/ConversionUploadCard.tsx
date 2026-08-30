"use client";

/** Nastavení → "Nahrávání konverzí do Google Ads": the operator's control over the
 *  one thing in this product that leaves it irreversibly.
 *
 *  Three pieces of honesty are load-bearing here, and are why this is a card rather
 *  than a toggle. (1) It says exactly what goes on the wire — ID kliknutí, čas,
 *  hodnota, měna — because "we upload your conversions" is the kind of sentence an
 *  operator reads as "you upload my customer list". (2) "Schválit" cannot be reached
 *  before a dry run, and the dry run shows the REAL rows (sibling component), not a
 *  count: an approval given without seeing the rows is an approval of nothing. (3)
 *  Sklik is named as the hand sheet it is — Seznam publishes no machine import, and
 *  implying a second live channel here would be the easiest lie on the page.
 *
 *  The disabled states below are a COURTESY, never the rule: the dry-run-then-approve
 *  gate lives on the server (`approveMapping`), so a hand-crafted POST meets exactly
 *  the same refusal. Choreography lives in `useConversionUpload`. */

import { Button, Pill } from "@/components/ui";
import { useProject } from "@/lib/projects/context";
import { useT } from "@/lib/i18n/client";
import { useConversionUpload } from "@/components/hooks/useConversionUpload";
import ConversionUploadDryRun from "./ConversionUploadDryRun";

const T = {
  cs: {
    title: "Nahrávání konverzí do Google Ads",
    subtitle:
      "Kvalifikované a uzavřené obchody z CRM pošleme do vaší konverzní akce v Google Ads. Odesíláme jen ID kliknutí (gclid), čas konverze, hodnotu a měnu — žádné jméno, e-mail ani telefon.",
    actionLabel: "Konverzní akce",
    pick: "— vyberte akci —",
    kinds: "Typy konverzí",
    qualified: "Kvalifikované",
    won: "Uzavřené",
    dryRun: "Zkušební běh",
    dryRunning: "Počítám…",
    approve: "Schválit nahrávání",
    approving: "Schvaluji…",
    pause: "Pozastavit",
    pausing: "Pozastavuji…",
    draft: "Neschváleno — nic se neodesílá",
    "dry-run": "Po zkušebním běhu — čeká na schválení",
    approved: "Aktivní — odesílá se každý den",
    paused: "Pozastaveno",
    irreversible:
      "Nahrání konverze je nevratné a Google ji při dvojím odeslání započítá dvakrát. Proto se každý odeslaný řádek označí a už nikdy se neodešle znovu.",
    lastDrain: "Poslední dávka {date}: {uploaded} nahráno, {failed} odmítnuto ({batch}).",
    sklikNote: "Sklik zůstává ruční tabulkou — Seznam strojové nahrávání konverzí nezveřejňuje.",
    "not-configured": "Server nemá Google Ads developer token, takže konverzní akce nelze načíst.",
    "not-connected": "Nejdřív připojte účet Google Ads (Nastavení → Napojení Google Ads).",
    "no-token": "Chybí autorizace Googlu — přihlaste se prosím znovu.",
    unreachable: "Seznam konverzních akcí se z Google Ads nepodařilo načíst.",
    loadError: "Nastavení nahrávání se nepodařilo načíst.",
    retry: "Zkusit znovu",
  },
  en: {
    title: "Conversion upload to Google Ads",
    subtitle:
      "Qualified and won deals from the CRM are sent to your Google Ads conversion action. We send only the click ID (gclid), the conversion time, the value and the currency — no name, e-mail or phone.",
    actionLabel: "Conversion action",
    pick: "— pick an action —",
    kinds: "Conversion types",
    qualified: "Qualified",
    won: "Won",
    dryRun: "Dry run",
    dryRunning: "Computing…",
    approve: "Approve uploading",
    approving: "Approving…",
    pause: "Pause",
    pausing: "Pausing…",
    draft: "Not approved — nothing is sent",
    "dry-run": "Dry run done — awaiting approval",
    approved: "Active — sent daily",
    paused: "Paused",
    irreversible:
      "An uploaded conversion cannot be taken back, and Google counts it twice if it is sent twice. So every sent row is marked and is never sent again.",
    lastDrain: "Last batch {date}: {uploaded} uploaded, {failed} rejected ({batch}).",
    sklikNote: "Sklik stays a hand-filled sheet — Seznam publishes no machine conversion import.",
    "not-configured": "The server has no Google Ads developer token, so conversion actions can't be listed.",
    "not-connected": "Connect a Google Ads account first (Settings → Google Ads link).",
    "no-token": "Google authorisation is missing — please sign in again.",
    unreachable: "The conversion-action list couldn't be read from Google Ads.",
    loadError: "Couldn't load the upload settings.",
    retry: "Try again",
  },
} as const;

const SELECT =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";

export default function ConversionUploadCard() {
  const project = useProject();
  const t = useT(T);
  const c = useConversionUpload(project.id);
  const m = c.mapping;

  if (c.failed) {
    return (
      <section className="mt-8 max-w-2xl">
        <div className="card flex flex-wrap items-center justify-between gap-3 p-6">
          <p className="text-sm text-negative" role="alert">{t("loadError")}</p>
          <Button variant="secondary" size="sm" onClick={() => void c.load()}>{t("retry")}</Button>
        </div>
      </section>
    );
  }

  const status = m?.status ?? "draft";
  const chosen = m?.conversionAction?.resourceName ?? "";
  const kinds = m?.kinds ?? { qualified: true, won: true };
  const canApprove = Boolean(m?.dryRunAt) && Boolean(chosen) && (kinds.qualified || kinds.won);

  const select = (resourceName: string, next = kinds) =>
    void c.post(
      "select",
      {
        resourceName,
        name: c.actions.find((a) => a.resourceName === resourceName)?.name ?? resourceName,
        kinds: next,
      },
      t("loadError")
    );

  return (
    <section className="mt-8 max-w-2xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-ink">{t("title")}</h3>
        <p className="mt-0.5 text-sm text-muted">{t("subtitle")}</p>
      </div>

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={status === "approved" ? "positive" : status === "paused" ? "coral" : "neutral"}>
            {t(status)}
          </Pill>
          {m?.lastDrain && (
            <span className="text-xs text-muted">
              {t("lastDrain", {
                date: m.lastDrain.at.slice(0, 10),
                uploaded: String(m.lastDrain.uploaded),
                failed: String(m.lastDrain.failed),
                batch: m.lastDrain.batchId,
              })}
            </span>
          )}
        </div>

        {c.reason && <p className="text-sm text-muted" role="status">{t(c.reason)}</p>}

        <label className="block">
          <span className="text-xs font-medium text-muted">{t("actionLabel")}</span>
          <select className={SELECT} value={chosen} onChange={(e) => select(e.target.value)}>
            <option value="">{t("pick")}</option>
            {c.actions.map((a) => (
              <option key={a.resourceName} value={a.resourceName}>
                {a.name}{a.type ? ` · ${a.type}` : ""}
              </option>
            ))}
            {/* An action already mapped but absent from a degraded list must stay
                selected — dropping it would silently re-open the picker on a mapping
                that is live. */}
            {chosen && !c.actions.some((a) => a.resourceName === chosen) && (
              <option value={chosen}>{m?.conversionAction?.name ?? chosen}</option>
            )}
          </select>
        </label>

        <div>
          <p className="text-xs font-medium text-muted">{t("kinds")}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {(["qualified", "won"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={kinds[k]}
                  disabled={!chosen || c.busy !== null}
                  onChange={(e) => select(chosen, { ...kinds, [k]: e.target.checked })}
                />
                {t(k)}
              </label>
            ))}
          </div>
        </div>

        <p className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
          {t("irreversible")}
        </p>

        {c.dryRun && <ConversionUploadDryRun run={c.dryRun} />}
        {c.notice && <p className="text-sm text-negative" role="alert">{c.notice}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={c.busy !== null || !chosen} onClick={() => void c.post("dry-run", {}, t("loadError"))}>
            {c.busy === "dry-run" ? t("dryRunning") : t("dryRun")}
          </Button>
          <Button variant="primary" size="sm" disabled={c.busy !== null || !canApprove} onClick={() => void c.post("approve", {}, t("loadError"))}>
            {c.busy === "approve" ? t("approving") : t("approve")}
          </Button>
          <Button variant="ghost" size="sm" disabled={c.busy !== null || status !== "approved"} onClick={() => void c.post("pause", {}, t("loadError"))}>
            {c.busy === "pause" ? t("pausing") : t("pause")}
          </Button>
        </div>

        <p className="text-xs text-muted">{t("sklikNote")}</p>
      </div>
    </section>
  );
}
