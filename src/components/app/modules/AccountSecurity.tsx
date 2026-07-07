"use client";

/** Account & Security — profile, an honest security checklist (dev-auth sessions
 *  genuinely lack a provider/session store, so those checks read "unavailable"),
 *  sign-out, and a GDPR account-deletion request. Deletion is irreversible and
 *  handled manually — this surface only *requests* it, never executes it.
 *  Account epic (consolidation phase 6). */
import { useState } from "react";
import { Check } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { initials } from "@/lib/branding/compute";
import { maskEmail, securityChecklist, type AccountFacts, type CheckState } from "@/lib/account/compute";

const SUPPORT_EMAIL = "podpora@adamant.app";

const T = {
  cs: {
    profile: "Profil", email: "E-mail", userId: "ID uživatele",
    security: "Zabezpečení",
    ck_email: "E-mailová adresa", ck_sso: "Přihlášení přes Google (SSO)", ck_session: "Aktivní relace", ck_twofa: "Dvoufaktorové ověření",
    st_ok: "Aktivní", st_action: "Vyžaduje akci", st_unavailable: "Nedostupné",
    twofaNote: "Dvoufaktorové ověření spravuje poskytovatel identity (Google).",
    sessions: "Relace", signOut: "Odhlásit se", signOutAll: "Odhlásit se všude",
    signOutAllNote: "Odvolání všech relací zatím není napojeno.",
    devNote: "Vývojové přihlášení (DEV_AUTH) — správa relací a odhlášení jsou dostupné jen v produkčním režimu.",
    danger: "Nebezpečná zóna", deleteTitle: "Smazání účtu",
    deleteBody: "Smazání účtu je nevratné — odstraní všechny projekty a data. Zpracováváme ho ručně.",
    deleteBtn: "Požádat o smazání účtu", deleteConfirm: "Opravdu chci smazat účet",
    deleteCancel: "Zrušit",
    deleteRequested: "Pro dokončení nás kontaktuj — žádost zpracujeme ručně a nevratně:",
    deleteMail: "Napsat na podporu",
  },
  en: {
    profile: "Profile", email: "Email", userId: "User ID",
    security: "Security",
    ck_email: "Email address", ck_sso: "Google sign-in (SSO)", ck_session: "Active session", ck_twofa: "Two-factor authentication",
    st_ok: "Active", st_action: "Needs action", st_unavailable: "Unavailable",
    twofaNote: "Two-factor auth is managed by the identity provider (Google).",
    sessions: "Sessions", signOut: "Sign out", signOutAll: "Sign out everywhere",
    signOutAllNote: "Revoking all sessions isn't wired up yet.",
    devNote: "Dev sign-in (DEV_AUTH) — session management and sign-out are available only in production mode.",
    danger: "Danger zone", deleteTitle: "Delete account",
    deleteBody: "Deleting your account is irreversible — it removes all projects and data. We handle it manually.",
    deleteBtn: "Request account deletion", deleteConfirm: "Yes, delete my account",
    deleteCancel: "Cancel",
    deleteRequested: "To complete this, contact us — we process the request manually and irreversibly:",
    deleteMail: "Email support",
  },
} as const;

const STATE_TONE: Record<CheckState, string> = {
  ok: "bg-positive-soft text-positive",
  action: "bg-coral-soft text-coral-600",
  unavailable: "bg-navy-50 text-muted",
};

export default function AccountSecurity({
  user,
  facts,
  signOutAction,
}: {
  user: { id: string; name: string; email: string; image?: string | null };
  facts: AccountFacts;
  signOutAction: () => void;
}) {
  const t = useT(T);
  const [confirming, setConfirming] = useState(false);
  const [requested, setRequested] = useState(false);
  const checks = securityChecklist(facts);

  const stateLabel = (s: CheckState) => (s === "ok" ? t("st_ok") : s === "action" ? t("st_action") : t("st_unavailable"));
  const checkLabel = (id: string) =>
    id === "email" ? t("ck_email") : id === "sso" ? t("ck_sso") : id === "session" ? t("ck_session") : t("ck_twofa");

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* Profile */}
      <div className="card p-6">
        <h3 className="mb-4 text-base font-semibold text-navy-800">{t("profile")}</h3>
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-500/15 text-brand-accent">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-bold">{initials(user.name || user.email || "?")}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-navy-800">{user.name || "—"}</p>
            <p className="truncate text-sm text-muted">{user.email ? maskEmail(user.email) : "—"}</p>
          </div>
        </div>
        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t("email")}</dt>
            <dd className="truncate text-navy-800">{user.email || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t("userId")}</dt>
            <dd className="tnum truncate text-navy-700">{user.id}</dd>
          </div>
        </dl>
      </div>

      {/* Security checklist */}
      <div className="card overflow-hidden">
        <h3 className="border-b border-line px-6 py-4 text-base font-semibold text-navy-800">{t("security")}</h3>
        <ul className="divide-y divide-line">
          {checks.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
              <div>
                <p className="text-sm font-medium text-navy-800">{checkLabel(c.id)}</p>
                {c.id === "twofa" && <p className="text-xs text-muted">{t("twofaNote")}</p>}
              </div>
              <span className={"rounded-pill px-2.5 py-1 text-xs font-semibold " + STATE_TONE[c.state]}>{stateLabel(c.state)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Sessions */}
      <div className="card p-6">
        <h3 className="mb-4 text-base font-semibold text-navy-800">{t("sessions")}</h3>
        {facts.devMode ? (
          <p className="rounded-lg bg-canvas px-4 py-3 text-sm text-muted">{t("devNote")}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <form action={signOutAction}>
              <button type="submit" className="rounded-pill bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-900">
                {t("signOut")}
              </button>
            </form>
            <button type="button" disabled title={t("signOutAllNote")} className="cursor-not-allowed rounded-pill border border-line px-4 py-2 text-sm font-semibold text-muted opacity-60">
              {t("signOutAll")}
            </button>
          </div>
        )}
        {!facts.devMode && <p className="mt-2 text-xs text-muted">{t("signOutAllNote")}</p>}
      </div>

      {/* Danger zone */}
      <div className="card border-negative/30 p-6">
        <h3 className="mb-1 text-base font-semibold text-negative">{t("danger")}</h3>
        <p className="mb-4 text-sm text-muted">{t("deleteBody")}</p>
        {requested ? (
          <div className="rounded-lg bg-canvas px-4 py-3 text-sm text-navy-700">
            <p>{t("deleteRequested")}</p>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Account%20deletion%20request%20(${encodeURIComponent(user.id)})`} className="mt-1 inline-block font-semibold text-brand-accent hover:text-brand-800">
              {t("deleteMail")} · {SUPPORT_EMAIL}
            </a>
          </div>
        ) : confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => { setRequested(true); setConfirming(false); }} className="inline-flex items-center gap-1.5 rounded-pill bg-negative px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90">
              <Check width={15} height={15} />{t("deleteConfirm")}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-navy-700 hover:border-navy-300">
              {t("deleteCancel")}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="rounded-pill border border-negative/40 px-4 py-2 text-sm font-semibold text-negative transition-colors hover:bg-negative/5">
            {t("deleteBtn")}
          </button>
        )}
      </div>
    </div>
  );
}
