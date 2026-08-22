"use client";

/** Hand-enter one enquiry. Posts to the SAME `applyLeadEvent` pipeline a connector
 *  uses, so a typed contact gets identical dedup, auto-merge and scoring — and a
 *  double submit lands on the same person rather than creating a twin. */
import { useState } from "react";
import { Button } from "@/components/ui";
import Modal from "@/components/app/Modal";
import { useT } from "@/lib/i18n/client";
import { EMAIL_MAX, NAME_MAX, NOTE_MAX, PHONE_MAX } from "@/lib/leads/types";

const T = {
  cs: {
    title: "Nový kontakt",
    lead: "Stačí jedno z: jméno, e-mail nebo telefon. Zbytek můžete doplnit později.",
    name: "Jméno", email: "E-mail", phone: "Telefon",
    source: "Zdroj", sourcePlaceholder: "např. doporučení, google-ads",
    note: "Poznámka / poptávka",
    save: "Založit kontakt", cancel: "Zrušit",
    failed: "Kontakt se nepodařilo založit. Zkuste to prosím znovu.",
    sample: "Projekt zatím běží na ukázkových datech — první uložený kontakt je přepne na reálná.",
  },
  en: {
    title: "New contact",
    lead: "One of name, email or phone is enough. The rest can follow later.",
    name: "Name", email: "Email", phone: "Phone",
    source: "Source", sourcePlaceholder: "e.g. referral, google-ads",
    note: "Note / enquiry",
    save: "Create contact", cancel: "Cancel",
    failed: "The contact could not be created. Please try again.",
    sample: "This project still shows sample data — the first saved contact switches it to real.",
  },
} as const;

export default function LeadCreateModal({
  open,
  onClose,
  live,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  live: boolean;
  onCreate: (input: Record<string, string>) => Promise<boolean>;
}) {
  const t = useT(T);
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const valid = [form.name, form.email, form.phone].some((v) => v.trim().length > 0);

  const submit = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await onCreate(form);
    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setForm({ name: "", email: "", phone: "", source: "", note: "" });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={t("title")} description={t("lead")}>
      <div className="space-y-3">
        <Field label={t("name")} value={form.name} max={NAME_MAX} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label={t("email")} value={form.email} max={EMAIL_MAX} type="email" onChange={(v) => setForm({ ...form, email: v })} />
        <Field label={t("phone")} value={form.phone} max={PHONE_MAX} type="tel" onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label={t("source")} value={form.source} max={80} placeholder={t("sourcePlaceholder")} onChange={(v) => setForm({ ...form, source: v })} />
        <label className="block">
          <span className="text-xs font-medium text-muted">{t("note")}</span>
          <textarea
            rows={3}
            maxLength={NOTE_MAX}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 outline-none focus:border-brand-400"
          />
        </label>
        {!live && <p className="text-xs text-muted">{t("sample")}</p>}
        {failed && <p className="text-xs text-negative">{t("failed")}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid || busy}>
            {t("save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  max,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 outline-none focus:border-brand-400"
      />
    </label>
  );
}
