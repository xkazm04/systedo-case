"use client";

/** WP S2 — the consent record, and the only way to write one.
 *
 *  This exists because `mayContact` fails closed: the twin's delivery gate refuses a
 *  channel with `consentRequired` unless a grant is on record, so without a way to
 *  RECORD one, such a channel could never send at all. It is also the honest half of
 *  the pairing — a product that gates on consent must give the operator somewhere to
 *  put it, or the gate is theatre.
 *
 *  Append-only by construction: the route never rewrites a record. A withdrawal
 *  stamps the one in force and appends its own row, so the history stays provable. */
import { useState } from "react";
import { Button, Pill } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { consentInForce, CONSENT_PURPOSES, type ConsentPurpose, type Contact } from "@/lib/leads/types";

const T = {
  cs: {
    none: "Nezaznamenán žádný souhlas. Bez záznamu marketingovou zprávu neposílejte — § 7 zák. 480/2004 Sb.",
    granted: "Uděleno", denied: "Neuděleno",
    basis: "právní základ: {basis}", origin: "zdroj: {origin}",
    purpose_service: "Odpověď na poptávku",
    purpose_marketing_email: "Marketing e-mailem",
    purpose_marketing_sms: "Marketing SMS",
    purpose_profiling: "Profilování",
    add: "Zaznamenat souhlas",
    withdraw: "Odvolat",
    evidence: "Znění, se kterým člověk souhlasil (důkaz)",
    saving: "Ukládám…",
    failed: "Záznam se nepodařilo uložit.",
    sample: "Ukázkový kontakt — souhlas lze zaznamenat až u reálného.",
  },
  en: {
    none: "No consent on record. Do not send a marketing message without one — Czech Act 480/2004 Coll., § 7.",
    granted: "Granted", denied: "Not granted",
    basis: "lawful basis: {basis}", origin: "origin: {origin}",
    purpose_service: "Answering the enquiry",
    purpose_marketing_email: "Email marketing",
    purpose_marketing_sms: "SMS marketing",
    purpose_profiling: "Profiling",
    add: "Record consent",
    withdraw: "Withdraw",
    evidence: "The wording the person agreed to (the evidence)",
    saving: "Saving…",
    failed: "The record could not be saved.",
    sample: "Sample contact — consent can only be recorded on a real one.",
  },
} as const;

export default function ConsentControl({
  projectId,
  contact,
  live,
}: {
  projectId: string;
  contact: Contact;
  /** false for a sample row — nothing to write to */
  live: boolean;
}) {
  const t = useT(T);
  const [purpose, setPurpose] = useState<ConsentPurpose>("marketing_email");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /** The route returns the whole updated contact, so this pane can show the new
   *  record immediately. Keyed by contact id so switching rows falls back to the
   *  prop by DERIVATION rather than needing an effect to reset it. */
  const [written, setWritten] = useState<Contact | null>(null);
  const shown = written && written.id === contact.id ? written : contact;

  const submit = async (p: ConsentPurpose, granted: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/crm/contacts/${encodeURIComponent(contact.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consent: { purpose: p, granted, basis: "consent", ...(evidence.trim() ? { evidenceText: evidence.trim() } : {}) },
          }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; contact?: Contact };
      if (!res.ok || !json.ok || !json.contact) throw new Error("refused");
      setEvidence("");
      setWritten(json.contact);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {shown.consent.length === 0 && <p className="text-sm leading-relaxed text-muted">{t("none")}</p>}
      <ul className="space-y-3">
        {CONSENT_PURPOSES.map((p) => {
          const rec = consentInForce(shown.consent, p);
          if (!rec) return null;
          return (
            <li key={p} className="text-xs">
              <span className="font-medium text-navy-800">{t(`purpose_${p}` as const)}</span>{" "}
              <Pill tone={rec.granted ? "positive" : "negative"}>{rec.granted ? t("granted") : t("denied")}</Pill>
              {rec.granted && live && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(p, false)}
                  className="ml-2 underline decoration-dotted underline-offset-2 text-muted hover:text-navy-800 disabled:opacity-50"
                >
                  {t("withdraw")}
                </button>
              )}
              <p className="mt-0.5 text-muted">
                {t("basis", { basis: rec.basis })} · {t("origin", { origin: rec.origin })}
              </p>
            </li>
          );
        })}
      </ul>

      {!live ? (
        <p className="text-xs text-muted">{t("sample")}</p>
      ) : (
        <div className="space-y-2 border-t border-line pt-3">
          <select
            aria-label={t("add")}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as ConsentPurpose)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-navy-800"
          >
            {CONSENT_PURPOSES.map((p) => (
              <option key={p} value={p}>{t(`purpose_${p}` as const)}</option>
            ))}
          </select>
          <input
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder={t("evidence")}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-navy-800"
          />
          <Button size="sm" disabled={busy} onClick={() => void submit(purpose, true)}>
            {busy ? t("saving") : t("add")}
          </Button>
          {failed && <p className="text-xs text-negative" role="alert">{t("failed")}</p>}
        </div>
      )}
    </div>
  );
}
