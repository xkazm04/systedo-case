"use client";

/** How one channel DELIVERS: which connector carries an approved draft, the
 *  confidence bar an `auto` draft must clear, and — WP S2, now that messages really
 *  leave the building — the two limits that stand between the twin and a person's
 *  inbox: a weekly send cap and a consent requirement.
 *
 *  Split out of TwinChannels so that screen stays a list and this stays a form. Both
 *  controls here are ENFORCED server-side inside the delivery claim
 *  (lib/twin/deliver.ts), not merely displayed: the cap is counted inside the same
 *  transaction that marks a draft `sent`, and the consent gate fails closed. This
 *  component is the operator's view of a rule, never the rule. */
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import type { ConnectorInfo } from "@/lib/twin/connectors";
import {
  DEFAULT_AUTO_THRESHOLD,
  MAX_MAX_PER_WEEK,
  MIN_MAX_PER_WEEK,
  defaultConsentRequired,
  type TwinChannel,
  type TwinChannelConfig,
} from "@/lib/twin/types";

const T = {
  cs: {
    connector: "Doručení",
    notConfigured: "nenastaveno",
    threshold: "Hranice jistoty",
    cap: "Týdenní limit odeslání",
    capOff: "bez limitu",
    capHint: "Kolik zpráv smí na tomto kanálu za týden odejít. Vynucuje se při odeslání.",
    consent: "Vyžadovat souhlas kontaktu",
    consentHint: "Bez zaznamenaného souhlasu se na tomto kanálu neodešle nic. Souhlas zaznamenáte v detailu kontaktu.",
  },
  en: {
    connector: "Delivery",
    notConfigured: "not configured",
    threshold: "Confidence bar",
    cap: "Weekly send limit",
    capOff: "no limit",
    capHint: "How many messages may leave on this channel per week. Enforced when sending.",
    consent: "Require the contact's consent",
    consentHint: "Nothing is sent on this channel without a recorded consent. Record one in the contact's detail.",
  },
} as const;

export default function TwinChannelDelivery({
  channel,
  cfg,
  connectors,
  onChange,
}: {
  channel: TwinChannel;
  cfg: TwinChannelConfig;
  /** connectors that serve this channel */
  connectors: ConnectorInfo[];
  onChange: (patch: Partial<TwinChannelConfig>) => void;
}) {
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";
  // An empty input means "no cap" — never 0, which would read as "send nothing".
  const capValue = typeof cfg.maxPerWeek === "number" ? String(cfg.maxPerWeek) : "";
  const consentOn = cfg.consentRequired ?? defaultConsentRequired(channel);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`connector-${channel}`} className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("connector")}
        </label>
        <select
          id={`connector-${channel}`}
          value={cfg.connector}
          onChange={(e) => onChange({ connector: e.target.value })}
          className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
        >
          {connectors.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.configured}>
              {(L === "en" ? c.labelEn : c.label) + (c.configured ? "" : ` (${t("notConfigured")})`)}
            </option>
          ))}
        </select>
      </div>

      {cfg.autonomy === "auto" && (
        <div>
          <label
            htmlFor={`threshold-${channel}`}
            className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted"
          >
            <span>{t("threshold")}</span>
            <span className="tnum text-navy-800">{cfg.autoThreshold} %</span>
          </label>
          <input
            id={`threshold-${channel}`}
            type="range"
            min={50}
            max={100}
            step={5}
            value={cfg.autoThreshold ?? DEFAULT_AUTO_THRESHOLD}
            onChange={(e) => onChange({ autoThreshold: Number(e.target.value) })}
            className="mt-1.5 w-full accent-brand-600"
          />
        </div>
      )}

      <div>
        <label
          htmlFor={`cap-${channel}`}
          className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted"
        >
          <span>{t("cap")}</span>
          {!capValue && <span className="text-muted">{t("capOff")}</span>}
        </label>
        <input
          id={`cap-${channel}`}
          type="number"
          inputMode="numeric"
          min={MIN_MAX_PER_WEEK}
          max={MAX_MAX_PER_WEEK}
          value={capValue}
          placeholder={t("capOff")}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            onChange({
              maxPerWeek: Number.isFinite(n) && n >= MIN_MAX_PER_WEEK ? Math.min(MAX_MAX_PER_WEEK, n) : undefined,
            });
          }}
          className="tnum mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <p className="mt-1.5 text-xs text-muted">{t("capHint")}</p>
      </div>

      <div>
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={consentOn}
            onChange={(e) => onChange({ consentRequired: e.target.checked })}
            className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-400"
          />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("consent")}</span>
        </label>
        <p className="mt-1.5 text-xs text-muted">{t("consentHint")}</p>
      </div>
    </div>
  );
}
