import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import ChromeGate from "@/components/site/ChromeGate";
import Providers from "@/components/auth/Providers";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { getServerLocale } from "@/lib/i18n/locale";
import { SITE_URL } from "@/lib/site";
import { auth, DEV_AUTH } from "@/auth";
import { DevInspector } from "./_dev-inspector/DevInspector";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE = "Adamant";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Adamant — AI ad intelligence",
    template: `%s · ${SITE}`,
  },
  description:
    "Adamant is the AI workspace for advertising — a rare breed in adtech. Performance dashboards, campaign intelligence and AI ad generation across Google Ads, Sklik and more.",
  applicationName: SITE,
  authors: [{ name: "Adamant" }],
  keywords: ["Adamant", "advertising", "ads", "PPC", "marketing", "dashboard", "AI", "adtech"],
  openGraph: {
    title: "Adamant — AI ad intelligence",
    description:
      "The AI workspace for advertising. A rare breed in adtech — be adamant about your ads.",
    type: "website",
  },
  robots: { index: false, follow: false },
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getServerLocale();
  // Only seed the session server-side in dev-auth mode; in production the client
  // provider fetches it as usual, so public pages keep doing no auth lookup.
  const session = DEV_AUTH ? await auth() : undefined;
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <LocaleProvider initialLocale={locale}>
        <Providers session={session} devAuth={DEV_AUTH}>
          <a
            href="#obsah"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-onyx focus:px-4 focus:py-2 focus:text-sm focus:text-onyx-ink"
          >
            Přejít na obsah
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
        {process.env.NODE_ENV === "development" && <DevInspector />}
      </body>
    </html>
  );
}
