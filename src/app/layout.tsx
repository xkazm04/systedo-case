import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import { SITE_URL } from "@/lib/site";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE = "Systedo · Case study";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Systedo · Case study — AI Vibecoder",
    template: `%s · ${SITE}`,
  },
  description:
    "Případová studie pro pozici AI Vibecoder: výkonnostní dashboard, článek pro web a AI generátor PPC inzerátů postavený na Gemini.",
  applicationName: SITE,
  authors: [{ name: "AI Vibecoder kandidát" }],
  keywords: ["Systedo", "marketing", "dashboard", "PNO", "PPC", "Gemini", "Next.js"],
  openGraph: {
    title: "Systedo · Case study — AI Vibecoder",
    description:
      "Výkonnostní dashboard, článek pro mionelo.cz a AI generátor PPC inzerátů na Gemini.",
    type: "website",
    locale: "cs_CZ",
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="cs"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#obsah"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-onyx focus:px-4 focus:py-2 focus:text-sm focus:text-onyx-ink"
        >
          Přejít na obsah
        </a>
        <Nav />
        <main id="obsah" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
