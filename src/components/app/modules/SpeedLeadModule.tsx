"use client";

import { useMemo, useState } from "react";
import { Pill } from "@/components/ui";
import { Bolt, Check, Clock } from "@/components/icons";
import { CHANNEL_LABELS, type InboundLead } from "@/lib/speed-lead/sample";
import { draftReply, SLA_TARGET_MIN } from "@/lib/speed-lead/draft";

function ago(min: number): string {
  if (min < 60) return `před ${min} min`;
  return `před ${Math.round(min / 60)} h`;
}

export default function SpeedLeadModule({ leads }: { leads: InboundLead[] }) {
  const [selectedId, setSelectedId] = useState(leads[0]?.id ?? "");
  const [responded, setResponded] = useState<Set<string>>(new Set());

  const selected = leads.find((l) => l.id === selectedId) ?? leads[0];
  const draft = useMemo(() => (selected ? draftReply(selected) : null), [selected]);

  if (!selected || !draft) return null;

  const isOverdue = (l: InboundLead) => !responded.has(l.id) && l.minutesAgo > SLA_TARGET_MIN;
  const overdueCount = leads.filter(isOverdue).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-card border border-line bg-canvas px-4 py-3 text-sm">
        <Clock width={16} height={16} className="text-brand-accent" />
        <span className="text-navy-700">
          Cíl reakce <strong>do {SLA_TARGET_MIN} min</strong>.
        </span>
        {overdueCount > 0 ? (
          <Pill tone="negative">{overdueCount} po SLA</Pill>
        ) : (
          <Pill tone="positive">Vše v SLA</Pill>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* inbox */}
        <div className="space-y-2">
          {leads.map((l) => {
            const active = l.id === selectedId;
            const done = responded.has(l.id);
            const overdue = isOverdue(l);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedId(l.id)}
                className={`w-full rounded-card border p-3 text-left transition-colors ${
                  active ? "border-brand-400 bg-brand-50/60 ring-2 ring-brand-200" : "border-line bg-surface hover:border-brand-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-navy-800">{l.name}</span>
                  {done ? (
                    <Pill tone="positive">
                      <Check width={12} height={12} />
                      Vyřízeno
                    </Pill>
                  ) : overdue ? (
                    <Pill tone="negative">Po SLA</Pill>
                  ) : (
                    <Pill tone="brand">Nový</Pill>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{l.message}</p>
                <p className="mt-1.5 text-[11px] text-muted">
                  {CHANNEL_LABELS[l.channel]} · {ago(l.minutesAgo)}
                </p>
              </button>
            );
          })}
        </div>

        {/* draft */}
        <div className="card p-5">
          <div className="border-b border-line pb-3">
            <h3 className="text-base font-semibold text-navy-800">{selected.name}</h3>
            <p className="mt-1 text-sm text-muted">
              {CHANNEL_LABELS[selected.channel]} · {ago(selected.minutesAgo)}
            </p>
            <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm text-navy-700">{selected.message}</p>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Návrh odpovědi</p>
            <textarea
              key={selected.id}
              defaultValue={draft.reply}
              rows={7}
              className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Kvalifikační otázky</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {draft.questions.map((q) => (
                <span key={q} className="rounded-pill bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800">
                  {q}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setResponded((s) => new Set(s).add(selected.id))}
              disabled={responded.has(selected.id)}
              className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              <Bolt width={15} height={15} />
              {responded.has(selected.id) ? "Odesláno" : "Odeslat odpověď"}
            </button>
            <span className="text-xs text-muted">Odeslání se v ukázce simuluje.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
