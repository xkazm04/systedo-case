import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE = "Systedo · Case study";

export const metadata: Metadata = {
  metadataBase: new URL("https://systedo-case.vercel.app"),
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
  themeColor: "#0b1b2b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#obsah"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-navy-800 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
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
