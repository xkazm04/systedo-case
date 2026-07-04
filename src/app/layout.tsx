import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import ChromeGate from "@/components/site/ChromeGate";
import Providers from "@/components/auth/Providers";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { getServerLocale } from "@/lib/i18n/locale";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { auth, DEV_AUTH } from "@/auth";
import { DevInspector } from "./_dev-inspector/DevInspector";
import { getT } from "@/lib/i18n/server";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Adamant — AI ad intelligence",
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  keywords: ["Adamant", "advertising", "ads", "PPC", "marketing", "dashboard", "AI", "adtech"],
  openGraph: {
    title: "Adamant — AI ad intelligence",
    description:
      "The AI workspace for advertising. A rare breed in adtech — be adamant about your ads.",
    type: "website",
  },
  // Illustrative case study with synthetic data: keep preview deploys and local
  // runs out of search, but let the canonical production deploy be found (the
  // whole point of a portfolio is discoverability) without the demo ranking for
  // real adtech queries. Toggle on VERCEL_ENV so only the production domain indexes.
  robots:
    process.env.VERCEL_ENV === "production"
      ? { index: true, follow: true }
      : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f16" },
  ],
};

/** Runs before paint: applies an explicitly-chosen theme from localStorage so
 *  there is no flash of the wrong palette. Absence of a stored choice means
 *  "follow the system", which the prefers-color-scheme CSS handles on its own. */
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

/** Runs before paint: upgrades <html lang> from the locale cookie. The <html>
 *  shell is prerendered static (Cache Components) with a `cs` default, so this
 *  corrects the lang attribute for `en` visitors without a server cookie read at
 *  the document root — which would make every route's shell dynamic. */
const langScript = `(function(){try{var m=document.cookie.match(/(?:^|; )locale=(cs|en)/);if(m){document.documentElement.lang=m[1];}}catch(e){}})();`;

const SKIP_T = {
  cs: { skip: "Přejít na obsah" },
  en: { skip: "Skip to content" },
} as const;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="cs"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: langScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        {/* The chrome + page read the locale cookie (and, in dev-auth, the
            session) — request data that Cache Components requires to sit inside a
            Suspense boundary. Keeping it here lets <html>/<body> prerender as the
            static shell while the localized app streams in (correctly localized
            server-side, so no flash of the default language for the content). */}
        <Suspense fallback={<main id="obsah" className="flex-1 bg-facets" aria-hidden />}>
          <LocalizedApp>{children}</LocalizedApp>
        </Suspense>
        {process.env.NODE_ENV === "development" && <DevInspector />}
      </body>
    </html>
  );
}

async function LocalizedApp({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale();
  const tSkip = await getT(SKIP_T);
  // Only seed the session server-side in dev-auth mode; in production the client
  // provider fetches it as usual, so public pages keep doing no auth lookup.
  const session = DEV_AUTH ? await auth() : undefined;
  return (
    <LocaleProvider initialLocale={locale}>
      <Providers session={session} devAuth={DEV_AUTH}>
        <a
          href="#obsah"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-onyx focus:px-4 focus:py-2 focus:text-sm focus:text-onyx-ink"
        >
          {tSkip("skip")}
        </a>
        <ChromeGate>
          <Nav />
        </ChromeGate>
        <main id="obsah" className="flex-1 bg-facets">
          {children}
        </main>
        <ChromeGate>
          <Footer />
        </ChromeGate>
      </Providers>
    </LocaleProvider>
  );
}
