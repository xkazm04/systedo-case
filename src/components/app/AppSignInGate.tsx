"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { Logo } from "@/components/icons";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    heading: "Otevřít pracovní prostor",
    body: "Přihlaste se přes Google a založte projekt — e-shop, aplikaci, generování leadů nebo obsahový web. Každý projekt si poskládá vlastní moduly podle svého typu.",
    signIn: "Přihlásit přes Google",
    footer: "Marketingové stránky case study zůstávají veřejné —",
    backToWeb: "zpět na web",
  },
  en: {
    heading: "Open workspace",
    body: "Sign in with Google and create a project — e-shop, app, lead generation, or content site. Each project assembles its own modules based on its type.",
    signIn: "Sign in with Google",
    footer: "The case study marketing pages remain public —",
    backToWeb: "back to website",
  },
} as const;

/** Shown when an anonymous visitor lands on /app. The product is per-user, so we
 *  ask for Google sign-in (the same provider the campaign connector needs for the
 *  Ads scope) before opening the workspace. */
export default function AppSignInGate() {
  const t = useT(T);
  return (
    <div className="grid min-h-[78vh] place-items-center bg-dotgrid px-4">
      <div className="card w-full max-w-md p-8 text-center sm:p-10">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-onyx text-brand-400">
          <Logo width={26} height={26} />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-navy-800">
          {t("heading")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t("body")}
        </p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/app" })}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <GoogleGlyph />
          {t("signIn")}
        </button>
        <p className="mt-5 text-xs text-muted">
          {t("footer")}{" "}
          <Link href="/" className="link-inline">
            {t("backToWeb")}
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
