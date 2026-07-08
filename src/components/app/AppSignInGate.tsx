"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { Check, Logo } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

/** The eval value props — kept out of the {cs,en} string table because the
 *  translator interpolates strings, not arrays. */
const PERKS: Record<string, string[]> = {
  cs: [
    "Reálné moduly s ukázkovými daty — prozkoumáte je hned, bez čekání",
    "Svoje čísla připojíte, až budete chtít (Google Ads, marže, pozice)",
    "Vaše data zůstávají soukromá jen ve vašem prostoru",
  ],
  en: [
    "Real modules with sample data — explore immediately, no waiting",
    "Connect your own numbers when you're ready (Google Ads, margins, ranks)",
    "Your data stays private to your workspace only",
  ],
};

const T = {
  cs: {
    kicker: "Zkušební prostor zdarma",
    heading: "Spusťte si vlastní Adamant",
    body: "Přihlášením přes Google si založíte skutečný pracovní prostor — ne ukázku. Vytvořte projekt (e-shop, aplikace, leady nebo obsah) a hned si projdete celý živý produkt.",
    signIn: "Přihlásit přes Google",
    trust: "Bez platební karty · založení trvá minutu · kdykoli smažete",
    footer: "Jen se rozhlížíte?",
    backToDemo: "Otevřít živou ukázku",
  },
  en: {
    kicker: "Free trial workspace",
    heading: "Start your own Adamant",
    body: "Sign in with Google to open a real workspace — not a demo. Create a project (e-shop, app, leads, or content) and explore the whole live product right away.",
    signIn: "Sign in with Google",
    trust: "No payment card · takes a minute to set up · delete anytime",
    footer: "Just looking around?",
    backToDemo: "Open the live demo",
  },
} as const;

/** Shown when an anonymous visitor lands on /app — the conversion wall a prospect
 *  hits after the public demo. Frames the product as a real free-trial workspace
 *  (not a portfolio) and asks for Google sign-in (the same provider the campaign
 *  connector needs for the Ads scope) before opening it. */
export default function AppSignInGate() {
  const t = useT(T);
  const { locale } = useLocale();
  const perks = PERKS[locale] ?? PERKS.cs!;
  return (
    <div className="grid min-h-[78vh] place-items-center bg-dotgrid px-4">
      <div className="card w-full max-w-md p-8 text-center sm:p-10">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-onyx text-brand-400">
          <Logo width={26} height={26} />
        </span>
        <span className="mt-6 inline-block rounded-pill bg-positive-soft px-3 py-1 text-xs font-semibold text-positive">
          {t("kicker")}
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800">
          {t("heading")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t("body")}
        </p>
        <ul className="mt-5 space-y-2 text-left">
          {perks.map((perk) => (
            <li key={perk} className="flex items-start gap-2.5 text-sm text-navy-700">
              <Check className="mt-0.5 shrink-0 text-positive" width={16} height={16} />
              <span>{perk}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/app" })}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <GoogleGlyph />
          {t("signIn")}
        </button>
        <p className="mt-3 text-xs text-muted">{t("trust")}</p>
        <p className="mt-5 text-xs text-muted">
          {t("footer")}{" "}
          <Link href="/dashboard" className="link-inline">
            {t("backToDemo")}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.5-11.3-8.3l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41.9 35.6 44 30.3 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
