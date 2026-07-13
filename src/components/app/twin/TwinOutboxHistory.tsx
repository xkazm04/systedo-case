"use client";

/** The outbox's read-only history list: every draft on the current channel with its
 *  status pill, contact, confidence and (for rejected drafts) the reason tag, plus a
 *  re-send affordance for an already-approved draft. Split out of TwinOutbox because
 *  it has no dependency on the compose-form / auto-bank / reject state machine — it
 *  only reads `drafts` and calls `onSend`. */
import { Pill } from "@/components/ui";
import { Send } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import type { TwinDraft } from "@/lib/twin/types";
import { REASON_LABELS } from "./labels";

const T = {
  cs: {
    history: "Historie",
    noHistory: "Zatím žádné koncepty na tomto kanálu.",
    send: "Odeslat",
    sending: "Odesílám…",
    autoApproved: "Schváleno automaticky",
    needsReview: "Čeká na schválení",
    approved: "Schváleno",
    sent: "Odesláno",
    rejected: "Zamítnuto",
  },
  en: {
    history: "History",
    noHistory: "No drafts on this channel yet.",
    send: "Send",
    sending: "Sending…",
    autoApproved: "Auto-approved",
    needsReview: "Awaiting approval",
    approved: "Approved",
    sent: "Sent",
    rejected: "Rejected",
  },
} as const;

export default function TwinOutboxHistory({
  drafts,
  locale,
  onSend,
  sendingId,
}: {
  drafts: TwinDraft[];
  locale: "cs" | "en";
  onSend: (id: string) => void;
  sendingId: string | null;
}) {
  const t = useT(T);
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("history")}</p>
      {drafts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t("noHistory")}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {drafts.map((d) => (
            <li key={d.id} className="rounded-card border border-line bg-surface px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill
                  tone={
                    d.status === "sent" || d.status === "approved"
                      ? "positive"
                      : d.status === "rejected"
                        ? "negative"
                        : "neutral"
                  }
                >
                  {d.status === "sent"
                    ? t("sent")
                    : d.status === "approved"
                      ? d.autoApproved
                        ? t("autoApproved")
                        : t("approved")
                      : d.status === "rejected"
                        ? t("rejected")
                        : t("needsReview")}
                </Pill>
                {d.contact && <span className="text-xs font-medium text-navy-800">{d.contact}</span>}
                <span className="tnum text-xs text-muted">{d.confidence} %</span>
                {d.rejectReason && (
                  <span className="pill bg-navy-50 text-muted">{REASON_LABELS[d.rejectReason][locale]}</span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-navy-700">{d.reply}</p>
              {d.status === "approved" && (
                <button
                  type="button"
                  onClick={() => onSend(d.id)}
                  disabled={sendingId === d.id}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-navy-800 disabled:opacity-50"
                >
                  <Send width={12} height={12} />
                  {sendingId === d.id ? t("sending") : t("send")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
