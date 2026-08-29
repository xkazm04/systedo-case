"use client";

/** "tento týden n/cap" for ONE twin voice scope — the cadence cap, shown where the
 *  twin is about to speak.
 *
 *  The twin has its own channel vocabulary (`TwinChannel`) that shares no ids with
 *  anything else, so the only honest bridge to a capped channel is the kanály track
 *  that says "this channel's twin voice is `social`" — which is exactly what
 *  `CadenceRule.twinScope` carries. No such track means no cap applies here, and
 *  then this renders NOTHING: a pill with an invented denominator would read as a
 *  limit the operator never set.
 *
 *  Read-only and self-contained (one GET, no props beyond the identity of what to
 *  count), so a host surface adopts it in one line instead of growing a fetch. */
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { checkCadence } from "@/lib/publishing/cadence";
import type { PublishingCalendar } from "@/lib/publishing/types";

const T = {
  cs: {
    label: "tento týden {n}/{cap}",
    hint: "Týdenní limit kadence z Kanálů. Vynucuje se při plánování příspěvků.",
  },
  en: {
    label: "this week {n}/{cap}",
    hint: "The weekly cadence cap from Channels. Enforced when scheduling posts.",
  },
} as const;

export default function CadencePill({
  projectId,
  twinScope,
}: {
  projectId: string;
  /** the `TwinChannel` this surface is speaking on */
  twinScope: string;
}) {
  const t = useT(T);
  const [data, setData] = useState<PublishingCalendar | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/projects/${projectId}/publishing`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PublishingCalendar>) : null))
      .then((json) => json && setData(json))
      .catch(() => {
        /* offline or aborted — no pill rather than a wrong one */
      });
    return () => ctrl.abort();
  }, [projectId]);

  const rule = data?.rules.find((r) => r.twinScope === twinScope);
  if (!data || !rule) return null;
  // Only the twin's own sends count here: the meter is about what THIS surface has
  // already put on the channel, and the full channel-week is on the calendar.
  const check = checkCadence(
    data.items.filter((i) => i.source === "twin"),
    rule.channel,
    new Date().toISOString(),
    data.rules
  );
  const over = check.count >= rule.maxPerWeek;

  return (
    <span
      title={t("hint")}
      className={`pill ${over ? "bg-coral-soft text-coral-600" : "bg-navy-50 text-muted"}`}
    >
      {t("label", { n: check.count, cap: rule.maxPerWeek })}
    </span>
  );
}
