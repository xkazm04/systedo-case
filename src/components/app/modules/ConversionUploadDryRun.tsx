"use client";

/** The dry run's TABLE — the rows that would actually be POSTed to Google, shown
 *  before anything is. A sibling component for the same reason `WebhookDeliveryLog`
 *  is one: the card it belongs to would otherwise sit over the 200-line ceiling, and
 *  this is the half with its own vocabulary.
 *
 *  It renders the PAYLOAD, not a summary of it: `gclid`, the Prague-stamped
 *  conversion time and the value exactly as they appear on the wire (the route hands
 *  back `buildGoogleUploadRows`' own output). That is the whole point of a dry run —
 *  an operator approving an irreversible upload is entitled to see the bytes, and a
 *  prettified re-rendering could differ from them without anyone noticing.
 *
 *  `validated` has THREE states and each gets its own sentence: Google accepted the
 *  batch in `validateOnly` mode, Google rejected it, or the check could not be run.
 *  The third is not a pass — collapsing "we could not ask" into "looks fine" is the
 *  exact dishonesty this screen exists to avoid. */

import { useT } from "@/lib/i18n/client";
import type { DryRunView } from "@/components/hooks/useConversionUpload";

const T = {
  cs: {
    title: "Takto by dávka vypadala",
    rows: "{rows} řádků k odeslání, {dropped} bez ID kliknutí vynecháno.",
    none: "Žádný řádek k odeslání — všechny konverze jsou buď už nahrané, nebo nemají ID kliknutí.",
    validatedOk: "Google dávku přijal v kontrolním režimu (nic se neodeslalo).",
    validatedNo: "Google dávku v kontrolním režimu odmítl — schválení zatím nedoporučujeme.",
    validatedNull:
      "Kontrolní ověření u Googlu se nepodařilo spustit; řádky níže jsou přesto přesně ty, které by šly.",
    colGclid: "ID kliknutí",
    colTime: "Čas konverze",
    colValue: "Hodnota",
    more: "…a dalších {n} řádků.",
  },
  en: {
    title: "This is what the batch would be",
    rows: "{rows} rows to send, {dropped} skipped for having no click ID.",
    none: "No rows to send — every conversion is either already uploaded or carries no click ID.",
    validatedOk: "Google accepted the batch in check mode (nothing was sent).",
    validatedNo: "Google rejected the batch in check mode — approving is not advised yet.",
    validatedNull:
      "The check with Google could not be run; the rows below are still exactly the ones that would go.",
    colGclid: "Click ID",
    colTime: "Conversion time",
    colValue: "Value",
    more: "…and {n} more rows.",
  },
} as const;

export default function ConversionUploadDryRun({ run }: { run: DryRunView }) {
  const t = useT(T);
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-xs font-semibold text-ink">{t("title")}</p>
      <p className="mt-1 text-xs text-muted">
        {run.rows === 0
          ? t("none")
          : t("rows", { rows: String(run.rows), dropped: String(run.dropped) })}
      </p>
      <p className="mt-1 text-xs text-muted">
        {run.validated === true
          ? t("validatedOk")
          : run.validated === false
            ? t("validatedNo")
            : t("validatedNull")}
      </p>

      {run.sample.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="pb-1 pr-3 font-medium">{t("colGclid")}</th>
                <th className="pb-1 pr-3 font-medium">{t("colTime")}</th>
                <th className="pb-1 font-medium">{t("colValue")}</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {run.sample.map((r) => (
                <tr key={r.gclid} className="border-t border-line/70">
                  <td className="py-1 pr-3 font-mono">{r.gclid}</td>
                  <td className="tnum py-1 pr-3">{r.conversionDateTime}</td>
                  <td className="tnum py-1">
                    {r.conversionValue == null ? "—" : `${r.conversionValue} ${r.currencyCode}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {run.rows > run.sample.length && (
        <p className="mt-2 text-xs text-muted">
          {t("more", { n: String(run.rows - run.sample.length) })}
        </p>
      )}
    </div>
  );
}
