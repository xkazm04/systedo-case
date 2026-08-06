"use client";

/** Account & Security — profile, an honest security checklist (dev-auth sessions
 *  genuinely lack a provider/session store, so those checks read "unavailable"),
 *  sign-out, and GDPR account-deletion instructions. Deletion is irreversible and
 *  handled manually over email — this surface only reveals the contact steps; it
 *  files nothing on the server, so the copy says so explicitly rather than dressing
 *  a no-op as a destructive confirm. Account epic (consolidation phase 6). */
import { useState } from "react";
import { useT, useFormatters } from "@/lib/i18n/client";
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
    signOutAllNote: "Odhlásí vás ze všech zařízení a odvolá všechny aktivní relace.",
    activeSessions: "Aktivních relací: {n}", validUntil: "Aktuální relace platná do {d}",
    sessionsUnavailable: "Počet aktivních relací se teď nepodařilo načíst.",
    revokeError: "Odhlášení na všech zařízeních se nezdařilo. Ostatní zařízení mohou být stále přihlášená. Zkuste to prosím znovu.",
    devNote: "Vývojové přihlášení (DEV_AUTH): správa relací a odhlášení jsou dostupné jen v produkčním režimu.",
    demoNote: "V ukázce nedostupné: bez přihlášení není žádná relace, kterou by šlo ukončit.",
    danger: "Nebezpečná zóna",
    deleteBody: "Smazání účtu je nevratné. Odstraní všechny projekty a data. Zpracováváme ho ručně.",
    deleteBtn: "Zobrazit pokyny ke smazání účtu",
    deleteRequested: "Žádost zatím nebyla nikde podána. Účet zůstává aktivní. Pro její podání nám napište; zpracujeme ji ručně a nevratně:",
    deleteMail: "Napsat na podporu",
  },
  en: {
    profile: "Profile", email: "Email", userId: "User ID",
    security: "Security",
    ck_email: "Email address", ck_sso: "Google sign-in (SSO)", ck_session: "Active session", ck_twofa: "Two-factor authentication",
    st_ok: "Active", st_action: "Needs action", st_unavailable: "Unavailable",
    twofaNote: "Two-factor authentication is managed by the identity provider (Google).",
    sessions: "Sessions", signOut: "Sign out", signOutAll: "Sign out everywhere",
    signOutAllNote: "Signs you out on every device and revokes all active sessions.",
    activeSessions: "Active sessions: {n}", validUntil: "Current session valid until {d}",
    sessionsUnavailable: "The active session count is temporarily unavailable.",
    revokeError: "Sign-out everywhere failed. Other devices may still be signed in. Please try again.",
    devNote: "Dev sign-in (DEV_AUTH): session management and sign-out are available only in production mode.",
    demoNote: "Unavailable in the demo: with no sign-in there's no session to end.",
    danger: "Danger zone",
    deleteBody: "Deleting your account is irreversible. It removes all projects and data. We handle it manually.",
    deleteBtn: "Show account deletion instructions",
    deleteRequested: "Nothing has been filed yet. Your account stays active. To submit the request, email us; we process it manually and irreversibly:",
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
  expiresDate,
  sessionCount,
  revokeError = false,
  signOutAction,
  signOutEverywhereAction,
  demo = false,
}: {
  user: { id: string | null; name: string; email: string; image?: string | null };
  facts: AccountFacts;
  /** ISO instant the current session expires, or null (dev-auth / no real session);
   *  formatted here in the user's locale + timezone to avoid a UTC off-by-one. */
  expiresDate: string | null;
  /** active session count, or null when the backend read failed (render "unavailable") */
  sessionCount: number | null;
  /** true when a prior "sign out everywhere" failed — show a real error, not silence */
  revokeError?: boolean;
  signOutAction: () => void;
  signOutEverywhereAction: () => void;
  /** Public /dashboard demo: there is no real session, so the sign-out / revoke
   *  actions are shown disabled with an explanation instead of being live controls
   *  wired to a silent server no-op (which reads as a bug, not a tour). */
  demo?: boolean;
}) {
  const t = useT(T);
  const fmt = useFormatters();
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
            <dd className="tnum truncate text-navy-700">{user.id ?? "—"}</dd>
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
          <>
            {revokeError && (
              <p className="mb-4 rounded-lg bg-coral-soft px-4 py-3 text-sm font-medium text-coral-600">{t("revokeError")}</p>
            )}
            {(sessionCount === null || (sessionCount ?? 0) > 0 || expiresDate) && (
              <div className="mb-4 space-y-1 text-sm text-muted">
                {sessionCount === null ? (
                  <p>{t("sessionsUnavailable")}</p>
                ) : (
                  sessionCount > 0 && <p>{t("activeSessions", { n: sessionCount })}</p>
                )}
                {expiresDate && <p className="tnum">{t("validUntil", { d: fmt.fmtDate(expiresDate) })}</p>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <form action={signOutAction}>
                <button type="submit" disabled={demo} title={demo ? t("demoNote") : undefined} className="rounded-pill bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-navy-800">
                  {t("signOut")}
                </button>
              </form>
              <form action={signOutEverywhereAction}>
                <button type="submit" disabled={demo} title={demo ? t("demoNote") : undefined} className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-navy-700 transition-colors hover:border-negative/50 hover:text-negative disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-navy-700">
                  {t("signOutAll")}
                </button>
              </form>
            </div>
            <p className="mt-2 text-xs text-muted">{demo ? t("demoNote") : t("signOutAllNote")}</p>
          </>
        )}
      </div>

      {/* Danger zone */}
      <div className="card border-negative/30 p-6">
        <h3 className="mb-1 text-base font-semibold text-negative">{t("danger")}</h3>
        <p className="mb-4 text-sm text-muted">{t("deleteBody")}</p>
        {requested ? (
          <div className="rounded-lg bg-canvas px-4 py-3 text-sm text-navy-700">
            <p>{t("deleteRequested")}</p>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Account%20deletion%20request%20(${encodeURIComponent(user.id ?? "")})`} className="mt-1 inline-block font-semibold text-brand-accent hover:text-brand-800">
              {t("deleteMail")} · {SUPPORT_EMAIL}
            </a>
          </div>
        ) : (
          <button type="button" onClick={() => setRequested(true)} className="rounded-pill border border-negative/40 px-4 py-2 text-sm font-semibold text-negative transition-colors hover:bg-negative/5">
            {t("deleteBtn")}
          </button>
        )}
      </div>
    </div>
  );
}
