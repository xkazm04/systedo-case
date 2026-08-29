"use client";

/** W3-B — the drafted arm set, previewed before anything reaches a public URL, plus
 *  the one control that puts it there.
 *
 *  The preview is not decoration: publishing writes these arms to an address real
 *  visitors will be split across, and the copy is model-written. Reading it first is
 *  the operator's only chance to catch a page that is wrong before the traffic sees
 *  it — so the publish button is deliberately downstream of a rendered preview rather
 *  than beside the draft button.
 *
 *  The CTA target is typed HERE and nowhere else. The model is never asked for a
 *  destination (it would invent one), and the server admits only `tel:` / `mailto:` /
 *  `https:` — so an operator's typo is dropped rather than rendered as a live link. */
import { buttonClass } from "@/components/ui";
import type { LpArmCopy } from "@/lib/ai-types";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    targetLabel: "Kam vede tlačítko (nepovinné)",
    targetPh: "https://… nebo mailto:…",
    publish: "Publikovat",
    publishing: "Publikuji…",
  },
  en: {
    targetLabel: "Where the button leads (optional)",
    targetPh: "https://… or mailto:…",
    publish: "Publish",
    publishing: "Publishing…",
  },
} as const;

export default function HostedLpDraft({
  arms,
  target,
  onTargetChange,
  busy,
  disabled,
  error,
  onPublish,
}: {
  arms: LpArmCopy[];
  target: string;
  onTargetChange: (v: string) => void;
  busy: boolean;
  disabled: boolean;
  error: string | null;
  onPublish: () => void;
}) {
  const t = useT(T);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {arms.map((a) => (
          <div key={a.armId} className="card border-brand-200 bg-brand-50/40 p-4">
            <p className="text-xs font-medium text-muted">{a.label}</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-navy-800">{a.headline}</p>
            <p className="mt-2 text-xs leading-relaxed text-navy-700">{a.intro}</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted">
              {a.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {a.cta && <span className="pill mt-3 inline-block bg-positive-soft text-positive">{a.cta}</span>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("targetLabel")}
          <input
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            placeholder={t("targetPh")}
            className="w-72 rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400"
          />
        </label>
        <button type="button" disabled={disabled} onClick={onPublish} className={buttonClass("primary")}>
          {busy ? t("publishing") : t("publish")}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-negative">{error}</p>}
    </>
  );
}
