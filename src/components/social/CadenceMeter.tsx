"use client";

/** The per-channel cadence meters under the publishing calendar: "n/cap this
 *  week", per channel the operator actually set a cap for.
 *
 *  This is the cap's ONLY read-side surface outside the kanály playbook, and it is
 *  the one that matters — it sits next to the week it governs, on the screen where
 *  people schedule. A meter is drawn only for a channel with a rule: an
 *  unconfigured channel has no promise to keep, and inventing a full bar for it
 *  would read as a limit nobody set. */
import { useT } from "@/lib/i18n/client";
import { CHANNEL_KEY_LABELS } from "@/lib/publishing/channel-key";
import type { CadenceCheck } from "@/lib/publishing/types";

const T = {
  cs: {
    title: "Kadence tento týden",
    hint: "Limity z Kanálů. Nad limit vás plánování nepustí bez potvrzení.",
    empty: "Zatím nemáte pro žádný kanál nastavený týdenní limit.",
    count: "{n} z {cap}",
    full: "Limit vyčerpán",
    over: "Nad limitem",
  },
  en: {
    title: "Cadence this week",
    hint: "Caps come from Channels. Scheduling past one needs an explicit confirmation.",
    empty: "No channel has a weekly cap set yet.",
    count: "{n} of {cap}",
    full: "Cap reached",
    over: "Over the cap",
  },
} as const;

/** Bar tone by how full the week is. `over` can only be reached through a human
 *  override, so it is a distinct state, not the same red as "full". */
function tone(count: number, cap: number): { bar: string; text: string } {
  if (count > cap) return { bar: "bg-negative", text: "text-negative" };
  if (count >= cap) return { bar: "bg-coral-500", text: "text-coral-600" };
  return { bar: "bg-brand-accent", text: "text-muted" };
}

export default function CadenceMeter({ checks }: { checks: CadenceCheck[] }) {
  const t = useT(T);
  const capped = checks.filter((c) => c.cap !== null);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("title")}</p>
        <p className="text-xs text-muted">{t("hint")}</p>
      </div>
      {capped.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {capped.map((c) => {
            const cap = c.cap ?? 0;
            const pct = cap > 0 ? Math.min(100, Math.round((c.count / cap) * 100)) : 0;
            const tn = tone(c.count, cap);
            return (
              <li key={c.channel} className="rounded-card border border-line bg-canvas px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">
                    {CHANNEL_KEY_LABELS[c.channel]}
                  </span>
                  <span className={`tnum shrink-0 text-xs font-semibold ${tn.text}`}>
                    {t("count", { n: c.count, cap })}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-line"
                  role="meter"
                  aria-valuenow={c.count}
                  aria-valuemin={0}
                  aria-valuemax={cap}
                  aria-label={`${CHANNEL_KEY_LABELS[c.channel]} — ${t("count", { n: c.count, cap })}`}
                >
                  <div className={`h-full rounded-pill ${tn.bar}`} style={{ width: `${pct}%` }} />
                </div>
                {c.count >= cap && (
                  <p className={`mt-1 text-[11px] font-medium ${tn.text}`}>
                    {c.count > cap ? t("over") : t("full")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
